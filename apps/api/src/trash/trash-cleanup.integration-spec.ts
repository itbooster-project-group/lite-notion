import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaTrashCleanupRepository } from './trash-cleanup.repository';

/**
 * Очистка по сроку хранения на живой базе: проверяется, что физические
 * FK-каскады действительно уносят поддеревья и документы, и что записи в
 * пределах срока не трогаются.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('очистка корзины по сроку хранения', () => {
  let prisma: PrismaClient;
  let repository: PrismaTrashCleanupRepository;
  const ownerId = randomUUID();
  let projectId: string;

  const cutoff = new Date('2026-08-01T00:00:00.000Z');
  const expired = new Date('2026-07-01T00:00:00.000Z');
  const fresh = new Date('2026-08-30T00:00:00.000Z');

  const createDeletedPage = async (
    parentPageId: string | null,
    deletedAt: Date,
    deletedOrigin: 'SELF' | 'PARENT_PAGE' | 'PROJECT',
  ) => {
    const page = await prisma.page.create({
      data: {
        createdById: ownerId,
        deletedAt,
        deletedOrigin,
        ownerId,
        parentPageId,
        position: 'V',
        projectId,
        title: 'page',
      },
    });

    await prisma.pageDocument.create({
      data: { pageId: page.id, tiptapSchemaVersion: 1, yjsState: new Uint8Array() },
    });

    return page;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    repository = new PrismaTrashCleanupRepository(prisma as unknown as PrismaService);

    await prisma.user.create({
      data: { email: `${ownerId}@cleanup.test`, id: ownerId, name: 'cleanup', passwordHash: 'x' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await prisma.project.create({ data: { name: 'cleanup', ownerId } })).id;
  });

  it('уносит просроченное поддерево вместе с документами', async () => {
    const root = await createDeletedPage(null, expired, 'SELF');
    const child = await createDeletedPage(root.id, expired, 'PARENT_PAGE');

    const counts = await repository.purgeExpired(cutoff);

    expect(counts.pages).toBeGreaterThan(0);
    await expect(prisma.page.count({ where: { id: { in: [root.id, child.id] } } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.pageDocument.count({ where: { pageId: { in: [root.id, child.id] } } }),
    ).resolves.toBe(0);
  });

  it('уносит просроченный проект со всеми его страницами', async () => {
    const page = await createDeletedPage(null, expired, 'PROJECT');
    await prisma.project.update({ data: { deletedAt: expired }, where: { id: projectId } });

    await repository.purgeExpired(cutoff);

    await expect(prisma.project.count({ where: { id: projectId } })).resolves.toBe(0);
    await expect(prisma.page.count({ where: { id: page.id } })).resolves.toBe(0);
  });

  it('не трогает записи в пределах срока хранения и живые страницы', async () => {
    const recentlyDeleted = await createDeletedPage(null, fresh, 'SELF');
    const alive = await prisma.page.create({
      data: {
        createdById: ownerId,
        ownerId,
        position: 'W',
        projectId,
        title: 'alive',
      },
    });

    await repository.purgeExpired(cutoff);

    await expect(
      prisma.page.count({ where: { id: { in: [recentlyDeleted.id, alive.id] } } }),
    ).resolves.toBe(2);
  });

  it('идемпотентна: повторный запуск не удаляет ничего дополнительно', async () => {
    await createDeletedPage(null, expired, 'SELF');

    const first = await repository.purgeExpired(cutoff);
    const second = await repository.purgeExpired(cutoff);

    expect(first.pages).toBeGreaterThan(0);
    expect(second).toEqual({ pages: 0, projects: 0 });
  });
});
