import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';

/**
 * Окончательное удаление: подтверждение `?cascade=true` и его отказ. Один и тот
 * же контракт у страниц и у проектов, поэтому оба проверяются здесь рядом.
 */
describe('purge HTTP contract', () => {
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

  const auth = <T extends { set: (name: string, value: string) => T }>(chain: T) =>
    chain.set('Authorization', authorization);

  const createPage = async (parentPageId: string | null = null, title = 'page') => {
    const response = await auth(request(server()).post('/api/v1/pages'))
      .send({ parentPageId, projectId, title })
      .expect(201);

    return response.body as { id: string };
  };

  const softDeletePage = (id: string) =>
    auth(request(server()).delete(`/api/v1/pages/${id}`)).expect(204);

  describe('маршрутизация', () => {
    it('очищает корзину, а не отвечает 400 от ParseUUIDPipe', async () => {
      await auth(request(server()).delete('/api/v1/pages/trash')).expect(204);
      await auth(request(server()).delete('/api/v1/projects/trash')).expect(204);
    });
  });

  describe('окончательное удаление страницы', () => {
    it('уносит поддерево и делает восстановление невозможным', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      await softDeletePage(root.id);

      await auth(request(server()).delete(`/api/v1/pages/trash/${root.id}`)).expect(204);

      await auth(request(server()).get('/api/v1/pages/trash')).expect(200).expect([]);
      await auth(request(server()).post(`/api/v1/pages/${root.id}/restore`)).expect(404);
      await auth(request(server()).post(`/api/v1/pages/${child.id}/restore`)).expect(404);
    });

    it('отказывает с 409 и перечисляет заголовки обречённых страниц', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'Архив 2024');
      await softDeletePage(child.id);
      await softDeletePage(root.id);

      const response = await auth(
        request(server()).delete(`/api/v1/pages/trash/${root.id}`),
      ).expect(409);

      expect(response.body).toMatchObject({ error: 'Conflict', statusCode: 409 });
      expect(response.body.message).toEqual([expect.any(String), 'Архив 2024']);

      // Ничего не удалено: оба корня по-прежнему в корзине.
      const trash = await auth(request(server()).get('/api/v1/pages/trash')).expect(200);

      expect(trash.body).toHaveLength(2);
    });

    it('удаляет целиком с cascade=true', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'Архив 2024');
      await softDeletePage(child.id);
      await softDeletePage(root.id);

      await auth(
        request(server()).delete(`/api/v1/pages/trash/${root.id}`).query({ cascade: 'true' }),
      ).expect(204);

      await auth(request(server()).get('/api/v1/pages/trash')).expect(200).expect([]);
    });

    it('не требует подтверждения, когда обречённых корней нет', async () => {
      const root = await createPage();
      await createPage(root.id, 'child');
      await softDeletePage(root.id);

      await auth(request(server()).delete(`/api/v1/pages/trash/${root.id}`)).expect(204);
    });

    it('не принимает cascade=false за подтверждение', async () => {
      const root = await createPage();
      const child = await createPage(root.id, 'child');
      await softDeletePage(child.id);
      await softDeletePage(root.id);

      await auth(
        request(server()).delete(`/api/v1/pages/trash/${root.id}`).query({ cascade: 'false' }),
      ).expect(409);
    });

    it('перечисляет пустой заголовок как есть', async () => {
      const root = await createPage();
      const child = await createPage(root.id, '');
      await softDeletePage(child.id);
      await softDeletePage(root.id);

      const response = await auth(
        request(server()).delete(`/api/v1/pages/trash/${root.id}`),
      ).expect(409);

      expect(response.body.message).toEqual([expect.any(String), '']);
    });

    it('отвечает 404 на живой странице тем же телом, что и на несуществующей', async () => {
      const page = await createPage();

      const alive = await auth(request(server()).delete(`/api/v1/pages/trash/${page.id}`)).expect(
        404,
      );
      const missing = await auth(
        request(server()).delete(`/api/v1/pages/trash/${missingId}`),
      ).expect(404);

      expect(alive.body.message).toBe(missing.body.message);
    });

    it('не даёт удалить чужую страницу навсегда', async () => {
      const page = await createPage();
      await softDeletePage(page.id);
      const foreign = `Bearer ${await context.signAccessToken(stranger)}`;

      await request(server())
        .delete(`/api/v1/pages/trash/${page.id}`)
        .set('Authorization', foreign)
        .expect(404);

      const trash = await auth(request(server()).get('/api/v1/pages/trash')).expect(200);

      expect(trash.body).toHaveLength(1);
    });
  });

  describe('очистка корзины страниц', () => {
    it('уносит всё показанное и оставляет живое дерево нетронутым', async () => {
      const alive = await createPage(null, 'alive');
      const dropped = await createPage(null, 'dropped');
      await softDeletePage(dropped.id);

      await auth(request(server()).delete('/api/v1/pages/trash')).expect(204);

      await auth(request(server()).get('/api/v1/pages/trash')).expect(200).expect([]);

      const tree = await auth(request(server()).get('/api/v1/pages')).expect(200);

      expect(tree.body.map((node: { id: string }) => node.id)).toEqual([alive.id]);
    });

    it('идемпотентна на пустой корзине', async () => {
      await auth(request(server()).delete('/api/v1/pages/trash')).expect(204);
      await auth(request(server()).delete('/api/v1/pages/trash')).expect(204);
    });

    it('оставляет удалённый проект восстановимым, но пустым', async () => {
      await createPage();
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      await auth(request(server()).delete('/api/v1/pages/trash')).expect(204);
      await auth(request(server()).post(`/api/v1/projects/${projectId}/restore`)).expect(200);

      await auth(request(server()).get('/api/v1/pages')).expect(200).expect([]);
    });

    it('не трогает чужую корзину', async () => {
      const page = await createPage();
      await softDeletePage(page.id);
      const foreign = `Bearer ${await context.signAccessToken(stranger)}`;

      await request(server())
        .delete('/api/v1/pages/trash')
        .set('Authorization', foreign)
        .expect(204);

      const trash = await auth(request(server()).get('/api/v1/pages/trash')).expect(200);

      expect(trash.body).toHaveLength(1);
    });
  });

  describe('окончательное удаление проекта', () => {
    it('отказывает с 409 и перечисляет отдельно удалённые страницы', async () => {
      const dropped = await createPage(null, 'Черновики');
      await softDeletePage(dropped.id);
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      const response = await auth(
        request(server()).delete(`/api/v1/projects/trash/${projectId}`),
      ).expect(409);

      expect(response.body.message).toEqual([expect.any(String), 'Черновики']);

      const trash = await auth(request(server()).get('/api/v1/projects/trash')).expect(200);

      expect(trash.body).toHaveLength(1);
    });

    it('удаляет проект целиком с cascade=true', async () => {
      const dropped = await createPage(null, 'Черновики');
      await softDeletePage(dropped.id);
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      await auth(
        request(server()).delete(`/api/v1/projects/trash/${projectId}`).query({ cascade: 'true' }),
      ).expect(204);

      await auth(request(server()).get('/api/v1/projects/trash')).expect(200).expect([]);
      await auth(request(server()).get('/api/v1/pages/trash')).expect(200).expect([]);
    });

    it('уносит содержимое страниц вместе с проектом', async () => {
      const page = await createPage();
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      await auth(request(server()).delete(`/api/v1/projects/trash/${projectId}`)).expect(204);

      // Документ уходит FK-каскадом; двойник обязан воспроизводить это, иначе
      // «содержимое ушло вместе со страницей» на нём не проверить.
      expect(context.documents.documents.has(page.id)).toBe(false);
    });

    it('не требует подтверждения, когда все страницы удалены вместе с проектом', async () => {
      await createPage();
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      await auth(request(server()).delete(`/api/v1/projects/trash/${projectId}`)).expect(204);
    });

    it('отвечает 404 на живом проекте тем же телом, что и на несуществующем', async () => {
      const alive = await auth(
        request(server()).delete(`/api/v1/projects/trash/${projectId}`),
      ).expect(404);
      const missing = await auth(
        request(server()).delete(`/api/v1/projects/trash/${missingId}`),
      ).expect(404);

      expect(alive.body.message).toBe(missing.body.message);
    });
  });

  describe('очистка корзины проектов', () => {
    it('отказывает с 409, если хотя бы в одном проекте есть отдельно удалённая страница', async () => {
      const dropped = await createPage(null, 'Черновики');
      await softDeletePage(dropped.id);
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      const response = await auth(request(server()).delete('/api/v1/projects/trash')).expect(409);

      expect(response.body.message).toEqual([expect.any(String), 'Черновики']);
    });

    it('очищает с cascade=true', async () => {
      const dropped = await createPage(null, 'Черновики');
      await softDeletePage(dropped.id);
      await auth(request(server()).delete(`/api/v1/projects/${projectId}`)).expect(204);

      await auth(
        request(server()).delete('/api/v1/projects/trash').query({ cascade: 'true' }),
      ).expect(204);

      await auth(request(server()).get('/api/v1/projects/trash')).expect(200).expect([]);
    });

    it('идемпотентна на пустой корзине', async () => {
      await auth(request(server()).delete('/api/v1/projects/trash')).expect(204);
      await auth(request(server()).delete('/api/v1/projects/trash')).expect(204);
    });
  });
});
