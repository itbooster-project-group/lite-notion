import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

/**
 * HTTP-контракт корзины страниц. Отдельный файл: здесь проверяется не только
 * форма ответов, но и порядок объявления маршрутов — `trash` против `:pageId`.
 */
describe('pages trash HTTP contract', () => {
  let context: HttpTestContext;
  let authorization: string;
  let projectId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = `Bearer ${await context.signAccessToken(owner)}`;
    projectId = (await context.projects.create({ name: 'Workspace', ownerId: owner })).id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  const server = () => context.app.getHttpServer();

  const createPage = async (parentPageId: string | null = null, title = 'page') => {
    const response = await request(server())
      .post('/api/v1/pages')
      .set('Authorization', authorization)
      .send({ parentPageId, projectId, title })
      .expect(201);

    return response.body as { id: string; position: string };
  };

  describe('маршрутизация', () => {
    it('отдаёт корзину, а не 400 от ParseUUIDPipe', async () => {
      const response = await request(server())
        .get('/api/v1/pages/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('требует аутентификации на корзине', async () => {
      await request(server()).get('/api/v1/pages/trash').expect(401);
    });
  });

  describe('удаление', () => {
    it('отвечает 204 с пустым телом', async () => {
      const page = await createPage();

      const response = await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    it('убирает страницу из дерева и показывает её в корзине', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');

      await request(server())
        .delete(`/api/v1/pages/${root.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const tree = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);
      const trash = await request(server())
        .get('/api/v1/pages/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(tree.body).toEqual([]);
      expect(trash.body).toHaveLength(1);
      expect(trash.body[0]).toMatchObject({ id: root.id });
      expect(trash.body[0].deletedAt).toEqual(expect.any(String));
      expect(trash.body[0].children.map((node: { id: string }) => node.id)).toEqual([child.id]);
    });

    it('не публикует источник удаления наружу', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const trash = await request(server())
        .get('/api/v1/pages/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(trash.body[0]).not.toHaveProperty('deletedOrigin');
    });

    it('отвечает 404 на повторное удаление тем же телом, что и на несуществующую', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const repeated = await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(404);
      const missing = await request(server())
        .delete(`/api/v1/pages/${missingId}`)
        .set('Authorization', authorization)
        .expect(404);

      expect(repeated.body.message).toBe(missing.body.message);
      expect(repeated.body.error).toBe(missing.body.error);
    });
  });

  describe('восстановление', () => {
    it('возвращает 200 и восстановленную страницу', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body).toMatchObject({ id: page.id, parentPageId: null });
    });

    it('поднимает страницу в корень, когда её родитель остался в корзине', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      await request(server())
        .delete(`/api/v1/pages/${child.id}`)
        .set('Authorization', authorization)
        .expect(204);
      await request(server())
        .delete(`/api/v1/pages/${root.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${child.id}/restore`)
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body.parentPageId).toBeNull();
    });

    it('поднимает в корень каскадно удалённого потомка, а не отказывает', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      await request(server())
        .delete(`/api/v1/pages/${root.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${child.id}/restore`)
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body).toMatchObject({ id: child.id, parentPageId: null });
    });

    it('отвечает 409, когда проект страницы в корзине', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .expect(409);

      expect(response.body).toMatchObject({ error: 'Conflict', statusCode: 409 });
    });

    it('восстанавливает в другой проект, когда собственный в корзине', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      const other = (await context.projects.create({ name: 'Other', ownerId: owner })).id;
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${root.id}/restore`)
        .set('Authorization', authorization)
        .send({ projectId: other })
        .expect(200);

      expect(response.body).toMatchObject({ parentPageId: null, projectId: other });

      const tree = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      expect(tree.body.map((node: { id: string }) => node.id)).toEqual([root.id]);
      expect(tree.body[0].children.map((node: { id: string }) => node.id)).toEqual([child.id]);
    });

    it('отвечает 400 на проект назначения, когда собственный проект жив', async () => {
      const page = await createPage();
      const other = (await context.projects.create({ name: 'Other', ownerId: owner })).id;
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      const response = await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .send({ projectId: other })
        .expect(400);

      expect(response.body).toMatchObject({ error: 'Bad Request', statusCode: 400 });
    });

    it('отвечает 404 на недоступный проект назначения', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .send({ projectId: missingId })
        .expect(404);
    });

    it('отклоняет projectId не в формате UUID', async () => {
      const page = await createPage();
      await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', authorization)
        .expect(204);

      await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .send({ projectId: 'not-a-uuid' })
        .expect(400);
    });

    it('отвечает 404 на неудалённой странице тем же телом, что и на несуществующей', async () => {
      const page = await createPage();

      const alive = await request(server())
        .post(`/api/v1/pages/${page.id}/restore`)
        .set('Authorization', authorization)
        .expect(404);
      const missing = await request(server())
        .post(`/api/v1/pages/${missingId}/restore`)
        .set('Authorization', authorization)
        .expect(404);

      expect(alive.body.message).toBe(missing.body.message);
    });
  });

  describe('изоляция по владельцу', () => {
    it('не даёт удалить, восстановить или увидеть чужую страницу', async () => {
      const page = await createPage();
      const foreignAuthorization = `Bearer ${await context.signAccessToken(stranger)}`;

      const deleteResponse = await request(server())
        .delete(`/api/v1/pages/${page.id}`)
        .set('Authorization', foreignAuthorization)
        .expect(404);
      const missingDelete = await request(server())
        .delete(`/api/v1/pages/${missingId}`)
        .set('Authorization', foreignAuthorization)
        .expect(404);
      const trash = await request(server())
        .get('/api/v1/pages/trash')
        .set('Authorization', foreignAuthorization)
        .expect(200);

      expect(deleteResponse.body.message).toBe(missingDelete.body.message);
      expect(trash.body).toEqual([]);

      // Страница осталась в дереве владельца: чужой запрос ничего не изменил.
      const tree = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      expect(tree.body).toHaveLength(1);
    });

    it('не отвечает 403 ни на одном маршруте корзины', async () => {
      const page = await createPage();
      const foreignAuthorization = `Bearer ${await context.signAccessToken(stranger)}`;

      const statuses = await Promise.all([
        request(server())
          .delete(`/api/v1/pages/${page.id}`)
          .set('Authorization', foreignAuthorization),
        request(server())
          .post(`/api/v1/pages/${page.id}/restore`)
          .set('Authorization', foreignAuthorization),
      ]);

      expect(statuses.map((response) => response.status)).toEqual([404, 404]);
    });
  });
});
