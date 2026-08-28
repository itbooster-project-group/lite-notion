import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './application';
import { PrismaService } from './database/prisma.service';

/**
 * Guard закрывает маршруты по умолчанию, и опубликованный контракт обязан
 * описывать то же распределение. Забытый `@ApiBearerAuth()` показал бы
 * защищённый маршрут открытым, а забытый `security: []` — публичный закрытым.
 * Ни то, ни другое не ломает рантайм, поэтому остальные тесты такую
 * рассинхронизацию не ловят: список приходится держать явным.
 *
 * Новая операция роняет этот тест — это и требуется: её нужно осознанно
 * отнести к публичным либо к защищённым.
 */
const PUBLIC_OPERATION_IDS = ['getHealth', 'login', 'refreshTokens', 'register'];

const SECURED_OPERATION_IDS = [
  'createPage',
  'createProject',
  'getCurrentUser',
  'getPage',
  'getPageDocument',
  'getPageTree',
  'listProjects',
  'logout',
  'logoutEverywhere',
  'movePage',
  'renamePage',
  'updatePageDocument',
];

interface DocumentedOperation {
  id: string;
  secured: boolean;
}

describe('OpenAPI security соответствует защите маршрутов', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ checkConnection: vi.fn(async () => undefined) })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('bearer стоит ровно на непубличных операциях', () => {
    const document = createOpenApiDocument(app);

    const operations: DocumentedOperation[] = Object.values(document.paths).flatMap((path) =>
      Object.values(path ?? {})
        .filter(
          (operation): operation is { operationId: string; security?: unknown[] } =>
            typeof operation === 'object' && operation !== null && 'operationId' in operation,
        )
        .map((operation) => ({
          id: operation.operationId,
          secured: (operation.security?.length ?? 0) > 0,
        })),
    );

    const secured = operations
      .filter((operation) => operation.secured)
      .map((operation) => operation.id)
      .sort();
    const open = operations
      .filter((operation) => !operation.secured)
      .map((operation) => operation.id)
      .sort();

    expect(open).toEqual([...PUBLIC_OPERATION_IDS].sort());
    expect(secured).toEqual([...SECURED_OPERATION_IDS].sort());
  });
});
