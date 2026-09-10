import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

import { AppModule } from '../app.module';
import { configureApplication } from '../application';
import { TokenService } from '../auth/crypto/token.service';
import { normalizeEmail } from '../common/helpers';
import { NodeEnvironment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { TransactionRunner } from '../database/transaction';
import { InMemoryTransactionRunner } from '../database/transaction.in-memory';
import { PagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { InMemoryPagePermissionsRepository } from '../page-permissions/page-permissions.repository.in-memory';
import { PageDocumentRepository } from '../pages/page-document/page-document.repository';
import { InMemoryPageDocumentRepository } from '../pages/page-document/page-document.repository.in-memory';
import { PagesRepository } from '../pages/pages.repository';
import {
  InMemoryPagesRepository,
  type StoredDocument,
  type StoredPage,
} from '../pages/pages.repository.in-memory';
import { ProjectsRepository } from '../projects/projects.repository';
import {
  InMemoryProjectsRepository,
  type StoredProject,
} from '../projects/projects.repository.in-memory';
import { UsersService } from '../users/users.service';

export interface HttpTestContext {
  app: INestApplication;
  pages: InMemoryPagesRepository;
  documents: InMemoryPageDocumentRepository;
  projects: InMemoryProjectsRepository;
  /** Позволяет тесту выдать разрешение до запроса. */
  permissions: InMemoryPagePermissionsRepository;
  /** Позволяет тесту проверить, какие локи взяла операция. */
  transactions: InMemoryTransactionRunner;
  /** Подписывает настоящий access-токен: guard проверяет подпись, а не мок. */
  signAccessToken: (userId: string) => Promise<string>;
}

/**
 * Поднимает приложение целиком — с глобальными guard, pipe и filter, — но
 * подменяет репозитории in-memory реализациями. Так HTTP-контракт проверяется
 * на настоящем стеке Nest, а база не нужна (`apps/api/AGENTS.md`).
 */
export async function createHttpTestContext(): Promise<HttpTestContext> {
  // Одна таблица документов на оба репозитория: страницу создаёт репозиторий
  // страниц, а содержимое читает и пишет репозиторий документа.
  const documentStore = new Map<string, StoredDocument>();
  // Хранилища общие на оба репозитория: в базе это отдельные таблицы одной схемы,
  // и каскад удаления проекта обязан быть виден через репозиторий страниц.
  const pageStore = new Map<string, StoredPage>();
  const projectStore = new Map<string, StoredProject>();
  const pages = new InMemoryPagesRepository(documentStore, projectStore, pageStore);
  const documents = new InMemoryPageDocumentRepository(documentStore, pageStore);
  const projects = new InMemoryProjectsRepository(pageStore, projectStore, documentStore);
  const permissions = new InMemoryPagePermissionsRepository(pageStore, projectStore);

  const transactions = new InMemoryTransactionRunner();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ checkConnection: vi.fn(async () => undefined) })
    .overrideProvider(TransactionRunner)
    .useValue(transactions)
    .overrideProvider(PagesRepository)
    .useValue(pages)
    .overrideProvider(PageDocumentRepository)
    .useValue(documents)
    .overrideProvider(ProjectsRepository)
    .useValue(projects)
    .overrideProvider(PagePermissionsRepository)
    .useValue(permissions)
    // Справочник пользователей общий с репозиторием разрешений: выдача ищет по email
    // ровно тех, кого тест туда положил.
    .overrideProvider(UsersService)
    .useValue({
      findByEmail: async (email: string) => {
        const normalized = normalizeEmail(email);

        for (const [id, user] of permissions.users) {
          if (user.email === normalized) {
            return { ...user, id };
          }
        }

        return null;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication({
    logger: ['error', 'fatal'],
  });

  configureApplication(app, {
    corsOrigin: 'http://localhost:3000',
    nodeEnvironment: NodeEnvironment.Test,
  });
  await app.init();

  const tokens = moduleRef.get(TokenService);

  return {
    app,
    documents,
    pages,
    permissions,
    projects,
    transactions,
    signAccessToken: (userId: string) =>
      tokens.signAccessToken({ sid: '99999999-9999-9999-9999-999999999999', sub: userId }),
  };
}
