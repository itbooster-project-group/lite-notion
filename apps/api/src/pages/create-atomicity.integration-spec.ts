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

/**
 * Страница и её документ появляются одной транзакцией. Двойник транзакции отката не
 * воспроизводит, поэтому инвариант проверяется только здесь.
 *
 * Требует поднятую базу и применённые миграции — см. `test:integration`.
 */
describe('атомарность создания страницы на живой базе', () => {
  let prisma: PrismaClient;
  let createPage: CreatePageUseCase;
  let failingCreatePage: CreatePageUseCase;
  const ownerId = randomUUID();
  let projectId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });

    const client = prisma as unknown as DatabaseClient;
    const transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    const pages = new PrismaPagesRepository(client);
    const projects = new PrismaProjectsRepository(client);

    /** Роняет вставку документа, не выходя из транзакции юзкейса. */
    class FailingDocuments extends PrismaPageDocumentRepository {
      override bind(scope: TransactionScope): FailingDocuments {
        return new FailingDocuments(databaseClientOf(scope));
      }

      override async insertEmpty(): Promise<void> {
        throw new Error('document insert failed');
      }
    }

    createPage = new CreatePageUseCase(
      transactions,
      pages,
      projects,
      new PrismaPageDocumentRepository(client),
    );
    failingCreatePage = new CreatePageUseCase(
      transactions,
      pages,
      projects,
      new FailingDocuments(client),
    );

    await prisma.user.create({
      data: { email: `${ownerId}@atomic.test`, id: ownerId, name: 'atomic', passwordHash: 'hash' },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.project.deleteMany({ where: { ownerId } });
    projectId = (await prisma.project.create({ data: { name: 'atomic', ownerId } })).id;
  });

  it('создаёт страницу вместе с её документом', async () => {
    const page = await createPage.execute({
      ownerId,
      parentPageId: null,
      projectId,
      title: 'page',
    });

    await expect(
      prisma.pageDocument.findUnique({ where: { pageId: page.id } }),
    ).resolves.not.toBeNull();
  });

  it('не оставляет страницу, если документ не создался', async () => {
    await expect(
      failingCreatePage.execute({ ownerId, parentPageId: null, projectId, title: 'page' }),
    ).rejects.toThrow('document insert failed');

    await expect(prisma.page.count({ where: { ownerId } })).resolves.toBe(0);
  });
});
