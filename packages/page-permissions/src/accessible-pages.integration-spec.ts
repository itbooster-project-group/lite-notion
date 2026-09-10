import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@lite-notion/database';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { findAccessiblePages } from './accessible-pages';
import { resolveEffectiveRole } from './effective-role';
import { PageRole } from './roles';

describe('findAccessiblePages on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let actorId: string;
  let projectId: string;

  const createdPageIds: string[] = [];
  const actorProjectIds: string[] = [];

  async function createActorProject(): Promise<string> {
    const id = randomUUID();

    await prisma.project.create({ data: { id, name: 'actor own', ownerId: actorId } });
    actorProjectIds.push(id);

    return id;
  }

  async function createPage(options: {
    parentPageId?: string | null;
    restricted?: boolean;
    owner?: string;
    project?: string;
  }): Promise<string> {
    const id = randomUUID();
    const pageOwner = options.owner ?? ownerId;

    await prisma.page.create({
      data: {
        accessMode: options.restricted === true ? 'RESTRICTED' : 'INHERIT',
        createdById: pageOwner,
        id,
        ownerId: pageOwner,
        parentPageId: options.parentPageId ?? null,
        position: 'a',
        projectId: options.project ?? projectId,
        title: id,
      },
    });
    createdPageIds.push(id);

    return id;
  }

  function grant(pageId: string, role: 'VIEWER' | 'EDITOR'): Promise<unknown> {
    return prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role, userId: actorId },
    });
  }

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    actorId = randomUUID();
    projectId = randomUUID();

    await prisma.user.createMany({
      data: [
        {
          email: `${ownerId}@accessible.integration.test`,
          id: ownerId,
          name: 'owner',
          passwordHash: 'test-hash',
        },
        {
          email: `${actorId}@accessible.integration.test`,
          id: actorId,
          name: 'actor',
          passwordHash: 'test-hash',
        },
      ],
    });
    await prisma.project.create({ data: { id: projectId, name: 'accessible', ownerId } });
  });

  afterEach(async () => {
    // Страницы уходят от листьев к корню, иначе мешает FK родителя; проекты — после них.
    for (const id of createdPageIds.splice(0).reverse()) {
      await prisma.page.deleteMany({ where: { id } });
    }

    for (const id of actorProjectIds.splice(0)) {
      await prisma.project.deleteMany({ where: { id } });
    }
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, actorId] } } });
    await prisma.$disconnect();
  });

  it('возвращает пустой список, когда ничего не выдано', async () => {
    await createPage({});

    await expect(findAccessiblePages(prisma, actorId)).resolves.toEqual([]);
  });

  it('возвращает выданную страницу и её наследующих потомков', async () => {
    const root = await createPage({});
    const child = await createPage({ parentPageId: root });
    const grandchild = await createPage({ parentPageId: child });

    await grant(root, 'EDITOR');

    const accessible = await findAccessiblePages(prisma, actorId);

    expect(new Set(accessible.map((page) => page.id))).toEqual(new Set([root, child, grandchild]));
    expect(accessible.every((page) => page.role === PageRole.EDITOR)).toBe(true);
  });

  it('обрезает выдачу на границе restricted', async () => {
    const root = await createPage({});
    const boundary = await createPage({ parentPageId: root, restricted: true });
    await createPage({ parentPageId: boundary });

    await grant(root, 'VIEWER');

    const accessible = await findAccessiblePages(prisma, actorId);

    expect(accessible.map((page) => page.id)).toEqual([root]);
  });

  it('не задваивает страницу с собственным разрешением внутри доступного поддерева', async () => {
    const root = await createPage({});
    const nested = await createPage({ parentPageId: root });
    const leaf = await createPage({ parentPageId: nested });

    await grant(root, 'EDITOR');
    await grant(nested, 'VIEWER');

    const accessible = await findAccessiblePages(prisma, actorId);
    const byId = new Map(accessible.map((page) => [page.id, page]));

    expect(accessible).toHaveLength(3);
    expect(byId.get(root)?.role).toBe(PageRole.EDITOR);
    // Ближайшее разрешение побеждает и при спуске — иначе потомок унаследовал бы editor.
    expect(byId.get(nested)?.role).toBe(PageRole.VIEWER);
    expect(byId.get(leaf)?.role).toBe(PageRole.VIEWER);
  });

  it('не показывает собственные страницы спрашивающего', async () => {
    const own = await createPage({ owner: actorId, project: await createActorProject() });

    const accessible = await findAccessiblePages(prisma, actorId);

    expect(accessible.map((page) => page.id)).not.toContain(own);
  });

  it('не показывает удалённые страницы и страницы удалённых проектов', async () => {
    const root = await createPage({});
    const child = await createPage({ parentPageId: root });

    await grant(root, 'EDITOR');
    await prisma.page.updateMany({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: child },
    });

    await expect(
      findAccessiblePages(prisma, actorId).then((pages) => pages.map((page) => page.id)),
    ).resolves.toEqual([root]);

    await prisma.project.update({ data: { deletedAt: new Date() }, where: { id: projectId } });
    await expect(findAccessiblePages(prisma, actorId)).resolves.toEqual([]);
    await prisma.project.update({ data: { deletedAt: null }, where: { id: projectId } });
  });

  /**
   * Свойство, ради которого оба запроса лежат в одном пакете: выдача не может
   * показать страницу, к которой вычисление роли не пустит, и не может показать её
   * с другой ролью. Разъедутся условия про `restricted` или удаление — падает здесь.
   */
  it('согласована с вычислением роли на каждом узле', async () => {
    const root = await createPage({});
    const child = await createPage({ parentPageId: root });
    const nested = await createPage({ parentPageId: child });
    const nestedLeaf = await createPage({ parentPageId: nested });
    const boundary = await createPage({ parentPageId: root, restricted: true });
    const behindBoundary = await createPage({ parentPageId: boundary });

    await grant(root, 'EDITOR');
    await grant(nested, 'VIEWER');

    const accessible = await findAccessiblePages(prisma, actorId);

    for (const page of accessible) {
      await expect(resolveEffectiveRole(prisma, actorId, page.id)).resolves.toBe(page.role);
    }

    const shown = new Set(accessible.map((page) => page.id));

    expect(shown).toEqual(new Set([root, child, nested, nestedLeaf]));

    // Обратная сторона свойства: что выдача скрыла, то и роль не даёт.
    for (const hidden of [boundary, behindBoundary]) {
      await expect(resolveEffectiveRole(prisma, actorId, hidden)).resolves.toBeNull();
    }
  });
});
