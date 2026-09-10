import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@lite-notion/database';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { resolveEffectiveRole } from './effective-role';
import { PageRole } from './roles';

/**
 * Подъём по цепочке — рекурсивный CTE, и подменить его фейком достоверно нельзя:
 * граница `restricted` живёт в условии рекурсии, а не в коде. Поэтому здесь
 * настоящая база и настоящее дерево.
 */
describe('resolveEffectiveRole on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let actorId: string;
  let projectId: string;

  const createdPageIds: string[] = [];

  async function createPage(options: {
    parentPageId?: string | null;
    restricted?: boolean;
    projectId?: string;
  }): Promise<string> {
    const id = randomUUID();

    await prisma.page.create({
      data: {
        accessMode: options.restricted === true ? 'RESTRICTED' : 'INHERIT',
        createdById: ownerId,
        id,
        ownerId,
        parentPageId: options.parentPageId ?? null,
        position: 'a',
        projectId: options.projectId ?? projectId,
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
          email: `${ownerId}@permissions.integration.test`,
          id: ownerId,
          name: 'owner',
          passwordHash: 'test-hash',
        },
        {
          email: `${actorId}@permissions.integration.test`,
          id: actorId,
          name: 'actor',
          passwordHash: 'test-hash',
        },
      ],
    });
    await prisma.project.create({ data: { id: projectId, name: 'permissions', ownerId } });
  });

  afterEach(async () => {
    // Порядок важен: страницы уходят от листьев к корню, иначе мешает FK родителя.
    for (const id of createdPageIds.splice(0).reverse()) {
      await prisma.page.deleteMany({ where: { id } });
    }

    await prisma.project.updateMany({ data: { deletedAt: null }, where: { id: projectId } });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, actorId] } } });
    await prisma.$disconnect();
  });

  it('даёт владельцу полный доступ без строки разрешения', async () => {
    const pageId = await createPage({});

    await expect(resolveEffectiveRole(prisma, ownerId, pageId)).resolves.toBe(PageRole.OWNER);
  });

  it('отказывает постороннему без разрешений', async () => {
    const pageId = await createPage({});

    await expect(resolveEffectiveRole(prisma, actorId, pageId)).resolves.toBeNull();
  });

  it('наследует разрешение сквозь несколько уровней inherit', async () => {
    const root = await createPage({});
    const middle = await createPage({ parentPageId: root });
    const leaf = await createPage({ parentPageId: middle });

    await grant(root, 'EDITOR');

    await expect(resolveEffectiveRole(prisma, actorId, leaf)).resolves.toBe(PageRole.EDITOR);
  });

  it('останавливает наследование на границе restricted', async () => {
    const root = await createPage({});
    const boundary = await createPage({ parentPageId: root, restricted: true });
    const leaf = await createPage({ parentPageId: boundary });

    await grant(root, 'EDITOR');

    await expect(resolveEffectiveRole(prisma, actorId, boundary)).resolves.toBeNull();
    await expect(resolveEffectiveRole(prisma, actorId, leaf)).resolves.toBeNull();
  });

  it('уважает прямое разрешение на самой restricted-странице', async () => {
    const root = await createPage({});
    const boundary = await createPage({ parentPageId: root, restricted: true });
    const leaf = await createPage({ parentPageId: boundary });

    await grant(boundary, 'VIEWER');

    await expect(resolveEffectiveRole(prisma, actorId, boundary)).resolves.toBe(PageRole.VIEWER);
    await expect(resolveEffectiveRole(prisma, actorId, leaf)).resolves.toBe(PageRole.VIEWER);
  });

  it('предпочитает ближайшее разрешение дальнему, даже когда оно уже', async () => {
    const root = await createPage({});
    const middle = await createPage({ parentPageId: root });
    const leaf = await createPage({ parentPageId: middle });

    await grant(root, 'EDITOR');
    await grant(middle, 'VIEWER');

    await expect(resolveEffectiveRole(prisma, actorId, root)).resolves.toBe(PageRole.EDITOR);
    await expect(resolveEffectiveRole(prisma, actorId, middle)).resolves.toBe(PageRole.VIEWER);
    await expect(resolveEffectiveRole(prisma, actorId, leaf)).resolves.toBe(PageRole.VIEWER);
  });

  it('закрывает удалённую страницу даже владельцу', async () => {
    const pageId = await createPage({});

    await prisma.page.update({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: pageId },
    });

    await expect(resolveEffectiveRole(prisma, ownerId, pageId)).resolves.toBeNull();
  });

  it('закрывает страницу удалённого проекта даже владельцу', async () => {
    const pageId = await createPage({});

    await prisma.project.update({ data: { deletedAt: new Date() }, where: { id: projectId } });

    await expect(resolveEffectiveRole(prisma, ownerId, pageId)).resolves.toBeNull();
  });

  it('не поднимается сквозь удалённого предка', async () => {
    const root = await createPage({});
    const leaf = await createPage({ parentPageId: root });

    await grant(root, 'EDITOR');
    await prisma.page.updateMany({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: root },
    });

    await expect(resolveEffectiveRole(prisma, actorId, leaf)).resolves.toBeNull();
  });
});
