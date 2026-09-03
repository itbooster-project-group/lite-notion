import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

describe('projects trash HTTP contract', () => {
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

    return response.body as { id: string };
  };

  describe('маршрутизация', () => {
    it('отдаёт корзину проектов, а не 400 от ParseUUIDPipe', async () => {
      const response = await request(server())
        .get('/api/v1/projects/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('требует аутентификации на корзине проектов', async () => {
      await request(server()).get('/api/v1/projects/trash').expect(401);
    });
  });

  describe('удаление', () => {
    it('отвечает 204 и убирает проект вместе с его страницами', async () => {
      await createPage();

      const response = await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      expect(response.text).toBe('');

      const projects = await request(server())
        .get('/api/v1/projects')
        .set('Authorization', authorization)
        .expect(200);
      const tree = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      expect(projects.body).toEqual([]);
      expect(tree.body).toEqual([]);
    });

    it('показывает удалённый проект в корзине с отметкой времени и без страниц', async () => {
      await createPage();
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const trash = await request(server())
        .get('/api/v1/projects/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(trash.body).toHaveLength(1);
      expect(trash.body[0]).toMatchObject({ id: projectId, name: 'Workspace', ownerId: owner });
      expect(trash.body[0].deletedAt).toEqual(expect.any(String));
      expect(trash.body[0]).not.toHaveProperty('pages');
    });

    it('оставляет страницы удалённого проекта в корзине страниц с их вложенностью', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const trash = await request(server())
        .get('/api/v1/pages/trash')
        .set('Authorization', authorization)
        .expect(200);

      expect(trash.body.map((node: { id: string }) => node.id)).toEqual([root.id]);
      expect(trash.body[0].children.map((node: { id: string }) => node.id)).toEqual([child.id]);
    });

    it('отвечает 404 на повторное удаление тем же телом, что и на несуществующий', async () => {
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const repeated = await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(404);
      const missing = await request(server())
        .delete(`/api/v1/projects/${missingId}`)
        .set('Authorization', authorization)
        .expect(404);

      expect(repeated.body.message).toBe(missing.body.message);
      expect(repeated.body.error).toBe(missing.body.error);
    });
  });

  describe('восстановление', () => {
    it('возвращает проект и его дерево', async () => {
      const root = await createPage();
      await createPage(root.id, 'child');
      const before = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);
      const restored = await request(server())
        .post(`/api/v1/projects/${projectId}/restore`)
        .set('Authorization', authorization)
        .expect(200);

      expect(restored.body).toMatchObject({ id: projectId, name: 'Workspace' });

      const after = await request(server())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      expect(after.body).toEqual(before.body);
    });

    it('отвечает 404 на неудалённом проекте тем же телом, что и на несуществующем', async () => {
      const alive = await request(server())
        .post(`/api/v1/projects/${projectId}/restore`)
        .set('Authorization', authorization)
        .expect(404);
      const missing = await request(server())
        .post(`/api/v1/projects/${missingId}/restore`)
        .set('Authorization', authorization)
        .expect(404);

      expect(alive.body.message).toBe(missing.body.message);
    });
  });

  describe('изоляция удалённого проекта', () => {
    it('отвечает 404 при создании страницы в удалённом проекте', async () => {
      await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', authorization)
        .expect(204);

      const deleted = await request(server())
        .post('/api/v1/pages')
        .set('Authorization', authorization)
        .send({ projectId, title: 'nope' })
        .expect(404);
      const missing = await request(server())
        .post('/api/v1/pages')
        .set('Authorization', authorization)
        .send({ projectId: missingId, title: 'nope' })
        .expect(404);

      expect(deleted.body.message).toBe(missing.body.message);
    });

    it('не даёт удалить или восстановить чужой проект', async () => {
      const foreignAuthorization = `Bearer ${await context.signAccessToken(stranger)}`;

      const deleteResponse = await request(server())
        .delete(`/api/v1/projects/${projectId}`)
        .set('Authorization', foreignAuthorization)
        .expect(404);
      const restoreResponse = await request(server())
        .post(`/api/v1/projects/${projectId}/restore`)
        .set('Authorization', foreignAuthorization)
        .expect(404);

      expect(deleteResponse.body.error).toBe('Not Found');
      expect(restoreResponse.body.error).toBe('Not Found');

      const projects = await request(server())
        .get('/api/v1/projects')
        .set('Authorization', authorization)
        .expect(200);

      expect(projects.body).toHaveLength(1);
    });
  });
});
