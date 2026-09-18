import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { PageRole } from '../page-permissions/constants';
import { ProjectsController } from '../projects/projects.controller';
import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { TIPTAP_SCHEMA_VERSION } from './constants';
import { positionBetween } from './helpers';
import { PagesController } from './pages.controller';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

describe('изоляция по владельцу и защита маршрутов', () => {
  let context: HttpTestContext;
  let authorization: Record<string, string>;
  let foreignPageId: string;
  let foreignProjectId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = context.identityOf(owner);

    const foreignProject = await context.projects.create({ name: 'Theirs', ownerId: stranger });
    foreignProjectId = foreignProject.id;

    const foreignPage = await context.pages.insert({
      createdById: stranger,
      ownerId: stranger,
      parentPageId: null,
      position: positionBetween(null, null),
      projectId: foreignProject.id,
      title: 'theirs',
    });
    await context.documents.insertEmpty(foreignPage.id, TIPTAP_SCHEMA_VERSION);
    foreignPageId = foreignPage.id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  /** Операции, адресующие страницу по идентификатору в пути. */
  const pageOperations = [
    { method: 'get' as const, path: (id: string) => `/api/v1/pages/${id}`, send: undefined },
    {
      method: 'patch' as const,
      path: (id: string) => `/api/v1/pages/${id}`,
      send: { title: 'renamed' },
    },
    {
      method: 'post' as const,
      path: (id: string) => `/api/v1/pages/${id}/move`,
      send: { parentPageId: null },
    },
  ];

  const call = (
    operation: (typeof pageOperations)[number],
    id: string,
    headers: Record<string, string>,
  ) => {
    const test = request(context.app.getHttpServer())[operation.method](operation.path(id));

    for (const [name, value] of Object.entries(headers)) {
      test.set(name, value);
    }

    return operation.send === undefined ? test.send() : test.send(operation.send);
  };

  describe('чужая и несуществующая страница неразличимы', () => {
    for (const operation of pageOperations) {
      it(`${operation.method.toUpperCase()} ${operation.path(':pageId')}`, async () => {
        const foreign = await call(operation, foreignPageId, authorization);
        const missing = await call(operation, missingId, authorization);

        expect(foreign.status).toBe(404);
        expect(missing.status).toBe(404);
        // path зависит от идентификатора в URL, всё остальное обязано совпадать.
        expect({ ...foreign.body, path: undefined, timestamp: undefined }).toEqual({
          ...missing.body,
          path: undefined,
          timestamp: undefined,
        });
      });
    }
  });

  describe('видимая страница с нехваткой роли отвечает запретом', () => {
    /** Операции, которым роли `viewer` не хватает. */
    const elevatedOperations: {
      method: 'patch' | 'put' | 'delete' | 'post';
      path: (id: string) => string;
      send?: Record<string, unknown>;
    }[] = [
      { method: 'patch', path: (id) => `/api/v1/pages/${id}`, send: { title: 'x' } },
      { method: 'delete', path: (id) => `/api/v1/pages/${id}` },
      { method: 'post', path: (id) => `/api/v1/pages/${id}/move`, send: { parentPageId: null } },
    ];

    for (const operation of elevatedOperations) {
      it(`${operation.method.toUpperCase()} ${operation.path(':pageId')} отвечает 403 читателю`, async () => {
        context.permissions.grant(foreignPageId, owner, PageRole.VIEWER);

        const test = request(context.app.getHttpServer())
          [operation.method](operation.path(foreignPageId))
          .set(authorization);
        const response =
          operation.send === undefined ? await test.send() : await test.send(operation.send);

        expect(response.status).toBe(403);
      });
    }

    it('редактору хватает роли на переименование, но не на удаление', async () => {
      context.permissions.grant(foreignPageId, owner, PageRole.EDITOR);

      const renamed = await request(context.app.getHttpServer())
        .patch(`/api/v1/pages/${foreignPageId}`)
        .set(authorization)
        .send({ title: 'renamed' });
      const deleted = await request(context.app.getHttpServer())
        .delete(`/api/v1/pages/${foreignPageId}`)
        .set(authorization)
        .send();

      expect(renamed.status).toBe(200);
      expect(deleted.status).toBe(403);
    });

    it('оставляет чтение доступным ровно тогда, когда изменение запрещено', async () => {
      context.permissions.grant(foreignPageId, owner, PageRole.VIEWER);

      const read = await request(context.app.getHttpServer())
        .get(`/api/v1/pages/${foreignPageId}`)
        .set(authorization)
        .send();

      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ accessRole: PageRole.VIEWER, id: foreignPageId });
    });
  });

  it('без разрешения ни одна операция не отвечает запретом', async () => {
    // Обратная сторона правила: `403` допустим только там, где страница видна.
    for (const operation of pageOperations) {
      const response = await call(operation, foreignPageId, authorization);

      expect(response.status).not.toBe(403);
    }
  });

  it('чужой и несуществующий проект неразличимы при создании страницы', async () => {
    const foreign = await request(context.app.getHttpServer())
      .post('/api/v1/pages')
      .set(authorization)
      .send({ projectId: foreignProjectId });
    const missing = await request(context.app.getHttpServer())
      .post('/api/v1/pages')
      .set(authorization)
      .send({ projectId: missingId });

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect({ ...foreign.body, timestamp: undefined }).toEqual({
      ...missing.body,
      timestamp: undefined,
    });
  });

  describe('маршруты закрыты по умолчанию', () => {
    const unauthenticated = [
      { method: 'post' as const, path: '/api/v1/pages', send: { projectId: missingId } },
      { method: 'get' as const, path: '/api/v1/pages', send: undefined },
      { method: 'get' as const, path: `/api/v1/pages/${missingId}`, send: undefined },
      { method: 'patch' as const, path: `/api/v1/pages/${missingId}`, send: { title: 'x' } },
      {
        method: 'post' as const,
        path: `/api/v1/pages/${missingId}/move`,
        send: { parentPageId: null },
      },
      { method: 'post' as const, path: '/api/v1/projects', send: { name: 'x' } },
      { method: 'get' as const, path: '/api/v1/projects', send: undefined },
    ];

    for (const route of unauthenticated) {
      it(`${route.method.toUpperCase()} ${route.path} без токена отвечает 401`, async () => {
        const test = request(context.app.getHttpServer())[route.method](route.path);
        const response = route.send === undefined ? await test.send() : await test.send(route.send);

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ error: 'Unauthorized', statusCode: 401 });
      });
    }

    it('обработчик не выполняется без токена', async () => {
      await request(context.app.getHttpServer())
        .post('/api/v1/projects')
        .send({ name: 'should not be created' })
        .expect(401);

      expect(context.projects.records.size).toBe(1);
    });
  });

  describe('ни один маршрут не помечен @Public()', () => {
    for (const controller of [PagesController, ProjectsController]) {
      it(controller.name, () => {
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBeUndefined();

        const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
          (name) => name !== 'constructor',
        );

        expect(handlers.length).toBeGreaterThan(0);

        for (const handler of handlers) {
          const target: unknown = Object.getOwnPropertyDescriptor(
            controller.prototype,
            handler,
          )?.value;

          expect(Reflect.getMetadata(IS_PUBLIC_KEY, target as object)).toBeUndefined();
        }
      });
    }
  });
});
