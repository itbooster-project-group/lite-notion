import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PurgeConfirmationRequiredError } from '../common/errors';
import type { PrismaService } from '../database/prisma.service';
import { PrismaTransactionRunner } from '../database/transaction';
import { PrismaClient } from '../generated/prisma/client';
import { ProjectNotFoundError } from '../projects/errors';
import { PrismaProjectsRepository } from '../projects/projects.repository';
import { PurgeProjectUseCase } from '../projects/use-cases/purge-project.use-case';
import { SoftDeleteProjectUseCase } from '../projects/use-cases/soft-delete-project.use-case';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { PageParentNotFoundError, PageRestoreProjectDeletedError } from './errors';
import { PrismaPageDocumentRepository } from './page-document/page-document.repository';
import { PrismaPagesRepository } from './pages.repository';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';
import { RestorePageUseCase } from './use-cases/restore-page.use-case';
import { SoftDeletePageUseCase } from './use-cases/soft-delete-page.use-case';

/**
 * Гонка между созданием страницы и мягким удалением её родителя или проекта.
 *
 * Тройной FK сверяет `(id, ownerId, projectId)` и про `deletedAt` не знает, поэтому
 * без блокировки владельца живая страница оказалась бы под удалённым предком.
 * Удержанная в первой транзакции блокировка делает тест детерминированным.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('гонки вокруг мягкого удаления', () => {
  let prisma: PrismaClient;
  let holder: PrismaClient;
  let pages: PrismaPagesRepository;
  let projects: PrismaProjectsRepository;
  let documents: PrismaPageDocumentRepository;
  let softDeleteProject: SoftDeleteProjectUseCase;
  let purgeProject: PurgeProjectUseCase;
  let createPageUseCase: CreatePageUseCase;
  let softDeletePageUseCase: SoftDeletePageUseCase;
  let movePageUseCase: MovePageUseCase;
  let restorePageUseCase: RestorePageUseCase;
  const ownerId = randomUUID();
  let projectId: string;

  const createPage = (parentPageId: string | null, title: string) =>
    createPageUseCase.execute({
      ownerId,
      parentPageId,
      projectId,
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
    documents = new PrismaPageDocumentRepository(prisma as unknown as PrismaService);
    const transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);

    softDeleteProject = new SoftDeleteProjectUseCase(transactions, projects, pages);
    purgeProject = new PurgeProjectUseCase(transactions, projects, pages);
    createPageUseCase = new CreatePageUseCase(transactions, pages, projects, documents);
    softDeletePageUseCase = new SoftDeletePageUseCase(transactions, pages);
    movePageUseCase = new MovePageUseCase(transactions, pages);
    restorePageUseCase = new RestorePageUseCase(transactions, pages, projects);

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

  /**
   * Перемещение читает будущего родителя, а пишет после. Между чтением и записью
   * помещается мягкое удаление этого родителя, и без блокировки владельца живое
   * поддерево оказалось бы под удалённым предком, не нарушив ни одного FK.
   */
  it('не переносит поддерево под родителя, помеченного удалённым в гонке', async () => {
    const parent = await createPage(null, 'parent');
    const moved = await createPage(null, 'moved');

    const outcome = await raceAgainst(
      (tx) =>
        tx.$executeRaw`
          UPDATE "Page"
          SET "deletedAt" = now(), "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
          WHERE "id" = ${parent.id}::uuid`,
      () =>
        movePageUseCase.execute({
          nextSiblingId: null,
          ownerId,
          pageId: moved.id,
          parentPageId: parent.id,
          previousSiblingId: null,
        }),
    );

    expect(outcome).toBeInstanceOf(PageParentNotFoundError);

    const row = await prisma.page.findUnique({
      select: { deletedAt: true, parentPageId: true },
      where: { id: moved.id },
    });

    expect(row?.parentPageId).toBeNull();
    expect(row?.deletedAt).toBeNull();
  });

  it('ждёт блокировку владельца при перемещении', async () => {
    const parent = await createPage(null, 'parent');
    const moved = await createPage(null, 'moved');
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const moving = movePageUseCase
        .execute({
          nextSiblingId: null,
          ownerId,
          pageId: moved.id,
          parentPageId: parent.id,
          previousSiblingId: null,
        })
        .then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(settled).toBe(false);

      void moving;
    });
  });

  /**
   * Восстановление читает проект страницы, а пишет после. Между чтением и записью
   * помещается удаление этого проекта: живой страницы в удалённом проекте не бывает.
   */
  it('не восстанавливает страницу в проект, удалённый в гонке', async () => {
    const page = await createPage(null, 'page');
    await softDeletePageUseCase.execute(page.id, ownerId);

    const outcome = await raceAgainst(
      (tx) =>
        tx.$executeRaw`UPDATE "Project" SET "deletedAt" = now() WHERE "id" = ${projectId}::uuid`,
      () => restorePageUseCase.execute({ ownerId, pageId: page.id, targetProjectId: null }),
    );

    expect(outcome).toBeInstanceOf(PageRestoreProjectDeletedError);
    await expect(prisma.page.count({ where: { deletedAt: null, projectId } })).resolves.toBe(0);
  });

  it('ждёт блокировку владельца при восстановлении', async () => {
    const page = await createPage(null, 'page');
    await softDeletePageUseCase.execute(page.id, ownerId);
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const restoring = restorePageUseCase
        .execute({ ownerId, pageId: page.id, targetProjectId: null })
        .then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(settled).toBe(false);

      void restoring;
    });
  });

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

    expect(outcome).toBeInstanceOf(PageParentNotFoundError);
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

  it('пишет содержимое живой страницы', async () => {
    const page = await createPage(null, 'page');

    await expect(
      documents.replace({
        ownerId,
        pageId: page.id,
        tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
        yjsState: new Uint8Array([1, 2, 3]),
      }),
    ).resolves.toMatchObject({ pageId: page.id });
  });

  it('не пишет содержимое в страницу, помеченную удалённой', async () => {
    const page = await createPage(null, 'page');
    const state = new Uint8Array([1, 2, 3]);

    await documents.replace({
      ownerId,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: state,
    });
    await softDeletePageUseCase.execute(page.id, ownerId);

    // Живость проверяет `PageDocumentService` до записи, поэтому к моменту UPDATE
    // проверка может устареть, а мягкое удаление строку документа не трогает —
    // без условия в самом UPDATE содержимое ушло бы в уже удалённую страницу.
    await expect(
      documents.replace({
        ownerId,
        pageId: page.id,
        tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION + 1,
        yjsState: new Uint8Array([9, 9]),
      }),
    ).resolves.toBeNull();

    const stored = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId: page.id } });

    expect(stored.tiptapSchemaVersion).toBe(TIPTAP_SCHEMA_VERSION);
    expect(Buffer.from(stored.yjsState).equals(Buffer.from(state))).toBe(true);
  });

  it('окончательное удаление проекта ждёт блокировку владельца', async () => {
    await createPage(null, 'page');
    await softDeleteProject.execute(projectId, ownerId);
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      const purging = purgeProject.execute(projectId, ownerId, true).then(
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
    await softDeleteProject.execute(projectId, ownerId);

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
      () => purgeProject.execute(projectId, ownerId, false),
    );

    expect(outcome).toBeInstanceOf(PurgeConfirmationRequiredError);
    expect((outcome as PurgeConfirmationRequiredError).titles).toEqual(['Черновики']);
    // Ничего не уничтожено: отказ и удаление в одной транзакции.
    await expect(prisma.project.count({ where: { id: projectId } })).resolves.toBe(1);
    await expect(prisma.page.count({ where: { id: page.id } })).resolves.toBe(1);
  });
});
