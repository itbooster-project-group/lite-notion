import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PurgeConfirmationRequiredError } from '../common/errors';
import type { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaProjectsRepository } from '../projects/projects.repository';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PageRestoreProjectDeletedError } from './errors';
import { PrismaPagesRepository } from './pages.repository';

/**
 * Корзина на живой базе. Здесь проверяется то, чего in-memory двойник по
 * определению не видит: рекурсивные CTE, значения enum, физические FK-каскады и
 * CHECK-constraint парности отметки и источника.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('корзина страниц и проектов на живой базе', () => {
  let prisma: PrismaClient;
  let pages: PrismaPagesRepository;
  let projects: PrismaProjectsRepository;
  const ownerId = randomUUID();
  let projectId: string;

  const createPage = async (parentPageId: string | null, title: string) =>
    pages.create({
      createdById: ownerId,
      ownerId,
      parentPageId,
      projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title,
    });

  const rowOf = (id: string) =>
    prisma.page.findUnique({
      select: { deletedAt: true, deletedOrigin: true, parentPageId: true, position: true },
      where: { id },
    });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    pages = new PrismaPagesRepository(prisma as unknown as PrismaService);
    projects = new PrismaProjectsRepository(prisma as unknown as PrismaService);

    await prisma.user.create({
      data: { email: `${ownerId}@trash.test`, id: ownerId, name: 'trash', passwordHash: 'hash' },
    });
  });

  afterAll(async () => {
    // Каскад удаляет проекты, страницы и документы.
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await projects.create({ name: 'Workspace', ownerId })).id;
  });

  describe('каскадное мягкое удаление', () => {
    it('помечает поддерево глубиной в три уровня одной отметкой времени', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');

      await expect(pages.softDelete(root.id, ownerId)).resolves.toBe(true);

      const rows = await Promise.all([rowOf(root.id), rowOf(child.id), rowOf(grandchild.id)]);

      expect(rows.map((row) => row?.deletedOrigin)).toEqual(['SELF', 'PARENT_PAGE', 'PARENT_PAGE']);
      expect(rows[1]?.deletedAt).toEqual(rows[0]?.deletedAt);
      expect(rows[2]?.deletedAt).toEqual(rows[0]?.deletedAt);
    });

    it('не перемечает поддерево, удалённое раньше и самостоятельно', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');
      await pages.softDelete(child.id, ownerId);
      const before = await rowOf(child.id);

      await pages.softDelete(root.id, ownerId);

      const after = await rowOf(child.id);

      expect(after?.deletedOrigin).toBe('SELF');
      expect(after?.deletedAt).toEqual(before?.deletedAt);
      expect((await rowOf(grandchild.id))?.deletedOrigin).toBe('PARENT_PAGE');
    });

    it('не находит уже удалённую страницу', async () => {
      const page = await createPage(null, 'page');
      await pages.softDelete(page.id, ownerId);

      await expect(pages.softDelete(page.id, ownerId)).resolves.toBe(false);
    });
  });

  describe('восстановление', () => {
    it('останавливает спуск на потомке с источником SELF', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(root.id, ownerId);

      await pages.restore(root.id, ownerId, null);

      expect((await rowOf(root.id))?.deletedAt).toBeNull();
      expect((await rowOf(child.id))?.deletedAt).not.toBeNull();
      expect((await rowOf(grandchild.id))?.deletedAt).not.toBeNull();
    });

    it('поднимает страницу в корень при удалённом родителе, сохраняя поддерево', async () => {
      const first = await createPage(null, 'first');
      const second = await createPage(null, 'second');
      const child = await createPage(first.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(first.id, ownerId);

      const restored = await pages.restore(child.id, ownerId, null);

      expect(restored.parentPageId).toBeNull();
      expect(restored.position > second.position).toBe(true);
      // Ранг соседа не тронут, а поддерево уехало вместе с поднятой страницей.
      expect((await rowOf(second.id))?.position).toBe(second.position);
      expect((await rowOf(grandchild.id))?.parentPageId).toBe(child.id);
      expect((await rowOf(grandchild.id))?.deletedAt).toBeNull();
    });

    it('поднимает в корень каскадно удалённого потомка вместе с его поддеревом', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');
      await pages.softDelete(root.id, ownerId);

      const restored = await pages.restore(child.id, ownerId, null);

      expect(restored.parentPageId).toBeNull();
      expect((await rowOf(grandchild.id))?.deletedAt).toBeNull();
      expect((await rowOf(root.id))?.deletedAt).not.toBeNull();
    });

    it('отказывает, пока проект страницы в корзине', async () => {
      const page = await createPage(null, 'page');
      await pages.softDelete(page.id, ownerId);
      await projects.softDelete(projectId, ownerId);

      await expect(pages.restore(page.id, ownerId, null)).rejects.toBeInstanceOf(
        PageRestoreProjectDeletedError,
      );
    });
  });

  describe('восстановление в другой проект', () => {
    it('переносит всё физическое поддерево одним statement и проходит тройной FK', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      const grandchild = await createPage(child.id, 'grandchild');
      const other = (await projects.create({ name: 'Other', ownerId })).id;
      await projects.softDelete(projectId, ownerId);

      const restored = await pages.restore(root.id, ownerId, other);

      expect(restored.projectId).toBe(other);
      expect(restored.parentPageId).toBeNull();

      const rows = await prisma.page.findMany({
        select: { deletedAt: true, id: true, projectId: true },
        where: { id: { in: [root.id, child.id, grandchild.id] } },
      });

      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.projectId === other)).toBe(true);
      expect(rows.every((row) => row.deletedAt === null)).toBe(true);
    });

    it('уводит удалённое вложенное поддерево за переносимой страницей', async () => {
      const root = await createPage(null, 'root');
      const dropped = await createPage(root.id, 'dropped');
      await pages.softDelete(dropped.id, ownerId);
      const other = (await projects.create({ name: 'Other', ownerId })).id;
      await projects.softDelete(projectId, ownerId);

      await pages.restore(root.id, ownerId, other);

      const row = await prisma.page.findUnique({
        select: { deletedAt: true, deletedOrigin: true, projectId: true },
        where: { id: dropped.id },
      });

      expect(row?.projectId).toBe(other);
      expect(row?.deletedOrigin).toBe('SELF');
      expect(row?.deletedAt).not.toBeNull();
    });

    it('не трогает ранги root-страниц проекта назначения', async () => {
      const page = await createPage(null, 'page');
      const other = (await projects.create({ name: 'Other', ownerId })).id;
      const existing = await pages.create({
        createdById: ownerId,
        ownerId,
        parentPageId: null,
        projectId: other,
        tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
        title: 'existing',
      });
      await projects.softDelete(projectId, ownerId);

      const restored = await pages.restore(page.id, ownerId, other);

      expect(restored.position > existing.position).toBe(true);
      expect((await rowOf(existing.id))?.position).toBe(existing.position);
    });

    it('отказывает на чужом проекте назначения', async () => {
      const page = await createPage(null, 'page');
      await projects.softDelete(projectId, ownerId);

      await expect(pages.restore(page.id, ownerId, randomUUID())).rejects.toThrow();
    });
  });

  describe('каскад проекта', () => {
    it('помечает живые страницы источником PROJECT и щадит удалённые раньше', async () => {
      const kept = await createPage(null, 'kept');
      const dropped = await createPage(null, 'dropped');
      await pages.softDelete(dropped.id, ownerId);
      const before = await rowOf(dropped.id);

      await projects.softDelete(projectId, ownerId);

      expect((await rowOf(kept.id))?.deletedOrigin).toBe('PROJECT');
      expect((await rowOf(dropped.id))?.deletedOrigin).toBe('SELF');
      expect((await rowOf(dropped.id))?.deletedAt).toEqual(before?.deletedAt);
    });

    it('восстанавливает ровно то, что пометило удалением проекта', async () => {
      const kept = await createPage(null, 'kept');
      const dropped = await createPage(null, 'dropped');
      await pages.softDelete(dropped.id, ownerId);
      await projects.softDelete(projectId, ownerId);

      await projects.restore(projectId, ownerId);

      expect((await rowOf(kept.id))?.deletedAt).toBeNull();
      expect((await rowOf(dropped.id))?.deletedAt).not.toBeNull();
    });
  });

  describe('окончательное удаление', () => {
    it('уносит поддерево и документы физическим каскадом', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      await pages.softDelete(root.id, ownerId);

      await pages.purge(root.id, ownerId, false);

      expect(await rowOf(root.id)).toBeNull();
      expect(await rowOf(child.id)).toBeNull();
      await expect(
        prisma.pageDocument.findUnique({ where: { pageId: child.id } }),
      ).resolves.toBeNull();
    });

    it('отказывается уносить вложенный корень корзины без подтверждения', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'Архив 2024');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(root.id, ownerId);

      const error = await pages.purge(root.id, ownerId, false).catch((reason) => reason);

      expect(error).toBeInstanceOf(PurgeConfirmationRequiredError);
      expect((error as PurgeConfirmationRequiredError).titles).toEqual(['Архив 2024']);
      // Ничего не удалено: отказ и удаление в одной транзакции.
      expect(await rowOf(root.id)).not.toBeNull();
      expect(await rowOf(child.id)).not.toBeNull();
    });

    it('уносит всё с подтверждением', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'Архив 2024');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(root.id, ownerId);

      await pages.purge(root.id, ownerId, true);

      expect(await rowOf(root.id)).toBeNull();
      expect(await rowOf(child.id)).toBeNull();
    });

    it('удаляет ветку внутри корзины, не трогая остальное', async () => {
      const root = await createPage(null, 'root');
      const branch = await createPage(root.id, 'branch');
      const other = await createPage(root.id, 'other');
      await pages.softDelete(root.id, ownerId);

      await pages.purge(branch.id, ownerId, false);

      expect(await rowOf(branch.id)).toBeNull();
      expect(await rowOf(other.id)).not.toBeNull();
      expect(await rowOf(root.id)).not.toBeNull();
    });

    it('оставляет удалённый проект восстановимым, но пустым, после очистки корзины', async () => {
      await createPage(null, 'page');
      await projects.softDelete(projectId, ownerId);

      await pages.purgeTrash(ownerId);

      await expect(projects.restore(projectId, ownerId)).resolves.not.toBeNull();
      await expect(prisma.page.count({ where: { projectId } })).resolves.toBe(0);
    });

    it('уносит проект со всеми страницами при подтверждении', async () => {
      const dropped = await createPage(null, 'Черновики');
      await pages.softDelete(dropped.id, ownerId);
      await projects.softDelete(projectId, ownerId);

      await expect(projects.purge(projectId, ownerId, false)).rejects.toBeInstanceOf(
        PurgeConfirmationRequiredError,
      );

      await projects.purge(projectId, ownerId, true);

      await expect(prisma.project.count({ where: { id: projectId } })).resolves.toBe(0);
      expect(await rowOf(dropped.id)).toBeNull();
    });
  });

  describe('инвариант отметок времени', () => {
    it('не даёт потомку отметку позже предка при удалении самостоятельно раньше', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(root.id, ownerId);

      const [rootRow, childRow] = await Promise.all([rowOf(root.id), rowOf(child.id)]);
      const rootDeletedAt = rootRow?.deletedAt as Date;
      const childDeletedAt = childRow?.deletedAt as Date;

      expect(childDeletedAt.getTime()).toBeLessThanOrEqual(rootDeletedAt.getTime());
    });

    it('выводит восстановленную страницу из прежнего поддерева перед новым удалением', async () => {
      const root = await createPage(null, 'root');
      const child = await createPage(root.id, 'child');
      await pages.softDelete(child.id, ownerId);
      await pages.softDelete(root.id, ownerId);
      // Восстановление поднимает страницу в корень: только так её отметка может
      // стать новее отметки прежнего предка, и физического каскада между ними
      // больше нет.
      await pages.restore(child.id, ownerId, null);
      await pages.softDelete(child.id, ownerId);

      const [rootRow, childRow] = await Promise.all([rowOf(root.id), rowOf(child.id)]);
      const rootDeletedAt = rootRow?.deletedAt as Date;
      const childDeletedAt = childRow?.deletedAt as Date;

      expect(childRow?.parentPageId).toBeNull();
      expect(childDeletedAt.getTime()).toBeGreaterThanOrEqual(rootDeletedAt.getTime());
    });
  });

  describe('CHECK-constraint парности', () => {
    it('отклоняет отметку удаления без источника', async () => {
      const page = await createPage(null, 'page');

      await expect(
        prisma.$executeRaw`UPDATE "Page" SET "deletedAt" = now() WHERE "id" = ${page.id}::uuid`,
      ).rejects.toThrow();
    });

    it('отклоняет источник без отметки удаления', async () => {
      const page = await createPage(null, 'page');

      await expect(
        prisma.$executeRaw`UPDATE "Page" SET "deletedOrigin" = 'SELF'::"PageDeletionOrigin" WHERE "id" = ${page.id}::uuid`,
      ).rejects.toThrow();
    });
  });
});
