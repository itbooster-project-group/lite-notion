import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PurgeConfirmationRequiredError } from '../common/errors';
import type { PrismaService } from '../database/prisma.service';
import { PrismaClient } from '../generated/prisma/client';
import { ProjectNotFoundError } from '../projects/errors';
import { PrismaProjectsRepository } from '../projects/projects.repository';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PageNotFoundError } from './errors';
import { PrismaPagesRepository } from './pages.repository';

/**
 * Гонка между созданием страницы и мягким удалением её родителя или проекта.
 *
 * Живость проверяет `PagesService` до открытия транзакции репозитория, поэтому к
 * моменту вставки проверка может устареть. Ни один FK этого не ловит: тройной
 * сверяет `(id, ownerId, projectId)` и про `deletedAt` не знает, — значит без
 * блокировки владельца в `create` появлялась бы живая страница под удалённым
 * предком, и инвариант `specs/page-tree` нарушался бы молча.
 *
 * Тест детерминирован: удержанная в первой транзакции блокировка владельца
 * гарантированно останавливает `create` на входе, пока родителя помечают
 * удалённым. In-memory двойник такое воспроизвести не может — он однопоточен.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('гонки вокруг мягкого удаления', () => {
  let prisma: PrismaClient;
  let holder: PrismaClient;
  let pages: PrismaPagesRepository;
  let projects: PrismaProjectsRepository;
  const ownerId = randomUUID();
  let projectId: string;

  const createPage = (parentPageId: string | null, title: string) =>
    pages.create({
      createdById: ownerId,
      ownerId,
      parentPageId,
      projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title,
    });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    holder = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    pages = new PrismaPagesRepository(prisma as unknown as PrismaService);
    projects = new PrismaProjectsRepository(prisma as unknown as PrismaService);

    await prisma.user.create({
      data: { email: `${ownerId}@race.test`, id: ownerId, name: 'race', passwordHash: 'hash' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await Promise.all([prisma.$disconnect(), holder.$disconnect()]);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await prisma.project.create({ data: { name: 'race', ownerId } })).id;
  });

  /**
   * Держит блокировку владельца и, пока она удерживается, выполняет `mark` —
   * пометку, которую `create` обязан увидеть, когда наконец войдёт.
   */
  const raceAgainst = async (
    mark: (tx: PrismaClient) => Promise<unknown>,
    creating: () => Promise<unknown>,
  ): Promise<unknown> => {
    let started: Promise<unknown> | null = null;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      // Запускается, но не дождётся: блокировка владельца у нас.
      started = creating().catch((error: Error) => error);

      await mark(tx as unknown as PrismaClient);
    });

    return started === null ? null : await started;
  };

  it('ждёт блокировку владельца, а не вставляет мимо неё', async () => {
    const parent = await createPage(null, 'parent');
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const creating = createPage(parent.id, 'child').then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      // Столько создание не занимает: если оно успело завершиться, значит вошло
      // мимо удерживаемой блокировки владельца — то есть не берёт её вовсе, и
      // сериализации с мягким удалением нет.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(settled).toBe(false);

      void creating;
    });

    // Блокировка отпущена вместе с транзакцией — создание проходит.
    await expect.poll(() => settled, { timeout: 5_000 }).toBe(true);
  });

  it('отвергает создание под родителем, помеченным удалённым в гонке', async () => {
    const parent = await createPage(null, 'parent');

    const outcome = await raceAgainst(
      (tx) =>
        tx.$executeRaw`
          UPDATE "Page"
          SET "deletedAt" = now(), "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
          WHERE "id" = ${parent.id}::uuid`,
      () => createPage(parent.id, 'child'),
    );

    expect(outcome).toBeInstanceOf(PageNotFoundError);
    await expect(prisma.page.count({ where: { parentPageId: parent.id } })).resolves.toBe(0);
  });

  it('отвергает создание в проекте, помеченном удалённым в гонке', async () => {
    const outcome = await raceAgainst(
      (tx) =>
        tx.$executeRaw`UPDATE "Project" SET "deletedAt" = now() WHERE "id" = ${projectId}::uuid`,
      () => createPage(null, 'orphan'),
    );

    expect(outcome).toBeInstanceOf(ProjectNotFoundError);
    await expect(prisma.page.count({ where: { projectId } })).resolves.toBe(0);
  });

  it('пропускает создание, когда гонки не было', async () => {
    const parent = await createPage(null, 'parent');

    const outcome = await raceAgainst(
      async () => undefined,
      () => createPage(parent.id, 'child'),
    );

    expect(outcome).toMatchObject({ parentPageId: parent.id });
  });

  it('не оставляет живой страницы под удалённым предком', async () => {
    const parent = await createPage(null, 'parent');

    await raceAgainst(
      (tx) =>
        tx.$executeRaw`
          UPDATE "Page"
          SET "deletedAt" = now(), "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
          WHERE "id" = ${parent.id}::uuid`,
      () => createPage(parent.id, 'child'),
    );

    const orphans = await prisma.$queryRaw<{ id: string }[]>`
      SELECT child."id"
      FROM "Page" child
      JOIN "Page" parent ON parent."id" = child."parentPageId"
      WHERE child."ownerId" = ${ownerId}::uuid
        AND child."deletedAt" IS NULL
        AND parent."deletedAt" IS NOT NULL
    `;

    expect(orphans).toEqual([]);
  });

  it('окончательное удаление проекта ждёт блокировку владельца', async () => {
    await createPage(null, 'page');
    await projects.softDelete(projectId, ownerId);
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const purging = projects.purge(projectId, ownerId, true).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(settled).toBe(false);

      void purging;
    });

    await expect.poll(() => settled, { timeout: 5_000 }).toBe(true);
  });

  it('не уносит страницу, помеченную в гонке, мимо подтверждения', async () => {
    const page = await createPage(null, 'Черновики');
    await projects.softDelete(projectId, ownerId);

    // Пока подтверждение считает обречённые страницы, параллельное мягкое
    // удаление помечает `page` как SELF. Без блокировки владельца подсчёт видит
    // снимок до этой пометки, и `project.delete` уносит страницу навсегда, ни о
    // чём не спросив.
    const outcome = await raceAgainst(
      (tx) =>
        tx.$executeRaw`
          UPDATE "Page"
          SET "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
          WHERE "id" = ${page.id}::uuid`,
      () => projects.purge(projectId, ownerId, false),
    );

    expect(outcome).toBeInstanceOf(PurgeConfirmationRequiredError);
    expect((outcome as PurgeConfirmationRequiredError).titles).toEqual(['Черновики']);
    // Ничего не уничтожено: отказ и удаление в одной транзакции.
    await expect(prisma.project.count({ where: { id: projectId } })).resolves.toBe(1);
    await expect(prisma.page.count({ where: { id: page.id } })).resolves.toBe(1);
  });
});
