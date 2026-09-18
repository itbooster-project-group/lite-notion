import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../app.module';
import { configureApplication, createOpenApiDocument } from '../application';
import { API_GLOBAL_PREFIX } from '../common/constants';
import { NodeEnvironment } from '../config/environment';
import { PrismaService } from '../database/prisma.service';
import { INTERNAL_ROUTE_PREFIX } from './constants';

/**
 * Документ снимается так же, как его снимает `generate-openapi`: сначала
 * `configureApplication`, потом `createOpenApiDocument`. Иначе пути пришли бы без
 * глобального префикса, и проверка префикса ничего бы не значила.
 */
describe('Внутренние маршруты вне публичного контракта', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ checkConnection: vi.fn(async () => undefined) })
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app, {
      corsOrigin: 'http://localhost:3000',
      nodeEnvironment: NodeEnvironment.Test,
    });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('OpenAPI-документ не содержит внутренних путей', () => {
    const document = createOpenApiDocument(app);

    const internalPaths = Object.keys(document.paths).filter((path) =>
      path.includes(`/${INTERNAL_ROUTE_PREFIX}/`),
    );

    expect(internalPaths).toEqual([]);
  });

  it('OpenAPI-документ описывает только пути под публичным префиксом', () => {
    const document = createOpenApiDocument(app);

    const outsidePublicPrefix = Object.keys(document.paths).filter(
      (path) => !path.startsWith(`/${API_GLOBAL_PREFIX}/`),
    );

    expect(outsidePublicPrefix).toEqual([]);
  });
});
