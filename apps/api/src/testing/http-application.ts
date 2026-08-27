import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { vi } from 'vitest';

import { AppModule } from '../app.module';
import { configureApplication } from '../application';
import { TokenService } from '../auth/crypto/token.service';
import { NodeEnvironment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { PageDocumentRepository } from '../pages/page-document/page-document.repository';
import { InMemoryPageDocumentRepository } from '../pages/page-document/page-document.repository.in-memory';
import { PagesRepository } from '../pages/pages.repository';
import { InMemoryPagesRepository, type StoredDocument } from '../pages/pages.repository.in-memory';
import { ProjectsRepository } from '../projects/projects.repository';
import { InMemoryProjectsRepository } from '../projects/projects.repository.in-memory';

export interface HttpTestContext {
  app: INestApplication;
  pages: InMemoryPagesRepository;
  documents: InMemoryPageDocumentRepository;
  projects: InMemoryProjectsRepository;
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
  const pages = new InMemoryPagesRepository(documentStore);
  const documents = new InMemoryPageDocumentRepository(documentStore);
  const projects = new InMemoryProjectsRepository();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ checkConnection: vi.fn(async () => undefined) })
    .overrideProvider(PagesRepository)
    .useValue(pages)
    .overrideProvider(PageDocumentRepository)
    .useValue(documents)
    .overrideProvider(ProjectsRepository)
    .useValue(projects)
    .compile();

  const app = moduleRef.createNestApplication();

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
    projects,
    signAccessToken: (userId: string) =>
      tokens.signAccessToken({ sid: '99999999-9999-9999-9999-999999999999', sub: userId }),
  };
}
