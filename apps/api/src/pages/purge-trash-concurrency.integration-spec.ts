import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  PrismaTransactionRunner,
  type TransactionScope,
} from '../database/transaction';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaProjectsRepository } from '../projects/projects.repository';
import { PrismaPageDocumentRepository } from './page-document/page-document.repository';
import { PrismaPagesRepository } from './pages.repository';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { PurgePagesTrashUseCase } from './use-cases/purge-pages-trash.use-case';
import { SoftDeletePageUseCase } from './use-cases/soft-delete-page.use-case';

/**
 * Откат транзакции и сериализация очистки с параллельным мягким удалением.
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('очистка корзины страниц на живой базе', () => {
  let prisma: PrismaClient;
  let holder: PrismaClient;
  let pages: PrismaPagesRepository;
  let createPage: CreatePageUseCase;
  let softDeletePage: SoftDeletePageUseCase;
  let purgeTrash: PurgePagesTrashUseCase;
  const ownerId = randomUUID();
  let projectId: string;

  const countPages = () => prisma.page.count({ where: { ownerId } });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    holder = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

    const transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);

    pages = new PrismaPagesRepository(prisma as unknown as DatabaseClient);
    createPage = new CreatePageUseCase(
      transactions,
      pages,
      new PrismaProjectsRepository(prisma as unknown as DatabaseClient),
      new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient),
    );
    softDeletePage = new SoftDeletePageUseCase(transactions, pages);
    purgeTrash = new PurgePagesTrashUseCase(transactions, pages);

    await prisma.user.create({
      data: { email: `${ownerId}@purge.test`, id: ownerId, name: 'purge', passwordHash: 'hash' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await Promise.all([prisma.$disconnect(), holder.$disconnect()]);
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await prisma.project.create({ data: { name: 'purge', ownerId } })).id;
  });

  const addPage = (parentPageId: string | null, title: string) =>
    createPage.execute({ ownerId, parentPageId, projectId, title });

  it('не оставляет частичного результата, когда отказывает в середине', async () => {
    const root = await addPage(null, 'root');
    await addPage(root.id, 'child');
    await softDeletePage.execute(root.id, ownerId);
    const before = await countPages();

    /** Удаляет по-настоящему и падает, не выходя из транзакции юзкейса. */
    class FailingAfterDelete extends PrismaPagesRepository {
      override bind(scope: TransactionScope): FailingAfterDelete {
        return new FailingAfterDelete(databaseClientOf(scope));
      }

      override async deleteAllDeletedByOwner(owner: string): Promise<void> {
        await super.deleteAllDeletedByOwner(owner);

        throw new Error('purge failed after delete');
      }
    }

    const failing = new PurgePagesTrashUseCase(
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
      new FailingAfterDelete(prisma as unknown as DatabaseClient),
    );

    await expect(failing.execute(ownerId)).rejects.toThrow('purge failed after delete');

    expect(await countPages()).toBe(before);
    await expect(prisma.pageDocument.count({ where: { page: { ownerId } } })).resolves.toBe(before);
  });

  it('ждёт блокировку владельца, а не очищает мимо параллельного удаления', async () => {
    const root = await addPage(null, 'root');
    const child = await addPage(root.id, 'child');
    let purging: Promise<void> | null = null;
    let settled = false;

    await holder.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;

      // Запускается, но не дождётся: блокировка владельца удерживается здесь.
      purging = purgeTrash.execute(ownerId).then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      // Пометка ложится, пока очистка стоит на блокировке.
      await tx.$executeRaw`
        UPDATE "Page"
        SET "deletedAt" = NOW(),
            "deletedOrigin" = CASE
              WHEN "id" = ${root.id}::uuid THEN 'SELF'::"PageDeletionOrigin"
              ELSE 'PARENT_PAGE'::"PageDeletionOrigin"
            END
        WHERE "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
      `;

      // Столько очистка не занимает: успела — значит вошла мимо блокировки.
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(settled).toBe(false);
    });

    await purging;

    // Очистка стартовала до пометки, увидела её и унесла поддерево целиком.
    await expect(prisma.page.findUnique({ where: { id: root.id } })).resolves.toBeNull();
    await expect(prisma.page.findUnique({ where: { id: child.id } })).resolves.toBeNull();
    expect(await countPages()).toBe(0);
  });
});
