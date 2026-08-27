import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { TITLE_MAX_LENGTH } from './constants';

const owner = '11111111-1111-1111-1111-111111111111';

describe('pages HTTP contract', () => {
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

  const post = (body: unknown) =>
    request(context.app.getHttpServer())
      .post('/api/v1/pages')
      .set('Authorization', authorization)
      .send(body as object);

  describe('валидация создания', () => {
    it('создаёт страницу и возвращает 201', async () => {
      const response = await post({ projectId, title: 'draft' }).expect(201);

      expect(response.body).toMatchObject({ ownerId: owner, projectId, title: 'draft' });
    });

    it('отклоняет запрос без projectId', async () => {
      const response = await post({ title: 'draft' }).expect(400);

      expect(response.body).toMatchObject({ error: 'Bad Request', statusCode: 400 });
    });

    it('отклоняет projectId не в формате UUID', async () => {
      await post({ projectId: 'not-a-uuid' }).expect(400);
    });

    it('отклоняет parentPageId не в формате UUID', async () => {
      await post({ parentPageId: 'not-a-uuid', projectId }).expect(400);
    });

    it('отклоняет слишком длинный заголовок', async () => {
      await post({ projectId, title: 'x'.repeat(TITLE_MAX_LENGTH + 1) }).expect(400);
    });

    it('отклоняет лишнее поле', async () => {
      await post({ extra: true, projectId }).expect(400);
    });

    it('принимает parentPageId: null как создание root-страницы', async () => {
      const response = await post({ parentPageId: null, projectId }).expect(201);

      expect(response.body.parentPageId).toBeNull();
    });
  });

  describe('поля, которые клиент задавать не может', () => {
    const forbidden = {
      createdById: '00000000-0000-0000-0000-000000000000',
      deletedAt: '2026-08-27T12:00:00.000Z',
      ownerId: '00000000-0000-0000-0000-000000000000',
      position: 'zzz',
    };

    for (const [field, value] of Object.entries(forbidden)) {
      it(`отклоняет ${field} при создании`, async () => {
        await post({ projectId, [field]: value }).expect(400);
      });

      it(`отклоняет ${field} при переименовании`, async () => {
        const page = await post({ projectId }).expect(201);

        await request(context.app.getHttpServer())
          .patch(`/api/v1/pages/${page.body.id}`)
          .set('Authorization', authorization)
          .send({ title: 'renamed', [field]: value })
          .expect(400);
      });

      it(`отклоняет ${field} при перемещении`, async () => {
        const page = await post({ projectId }).expect(201);

        await request(context.app.getHttpServer())
          .post(`/api/v1/pages/${page.body.id}/move`)
          .set('Authorization', authorization)
          .send({ parentPageId: null, [field]: value })
          .expect(400);
      });
    }

    it('отклоняет projectId при переименовании и при перемещении', async () => {
      const page = await post({ projectId }).expect(201);

      await request(context.app.getHttpServer())
        .patch(`/api/v1/pages/${page.body.id}`)
        .set('Authorization', authorization)
        .send({ projectId, title: 'renamed' })
        .expect(400);

      await request(context.app.getHttpServer())
        .post(`/api/v1/pages/${page.body.id}/move`)
        .set('Authorization', authorization)
        .send({ parentPageId: null, projectId })
        .expect(400);
    });
  });

  describe('статусы операций дерева', () => {
    it('отвечает 409 на попытку перенести страницу в саму себя', async () => {
      const page = await post({ projectId }).expect(201);

      const response = await request(context.app.getHttpServer())
        .post(`/api/v1/pages/${page.body.id}/move`)
        .set('Authorization', authorization)
        .send({ parentPageId: page.body.id })
        .expect(409);

      expect(response.body).toMatchObject({ error: 'Conflict', statusCode: 409 });
    });

    it('отвечает 400 на соседа под другим родителем', async () => {
      const parent = await post({ projectId }).expect(201);
      const child = await post({ parentPageId: parent.body.id, projectId }).expect(201);
      const root = await post({ projectId }).expect(201);

      await request(context.app.getHttpServer())
        .post(`/api/v1/pages/${root.body.id}/move`)
        .set('Authorization', authorization)
        .send({ parentPageId: null, previousSiblingId: child.body.id })
        .expect(400);
    });

    it('отвечает 400 на родителя из другого проекта', async () => {
      const other = await context.projects.create({ name: 'Other', ownerId: owner });
      const here = await post({ projectId }).expect(201);
      const there = await post({ projectId: other.id }).expect(201);

      await request(context.app.getHttpServer())
        .post(`/api/v1/pages/${here.body.id}/move`)
        .set('Authorization', authorization)
        .send({ parentPageId: there.body.id })
        .expect(400);
    });

    it('отвечает 400 на pageId не в формате UUID', async () => {
      await request(context.app.getHttpServer())
        .get('/api/v1/pages/not-a-uuid')
        .set('Authorization', authorization)
        .expect(400);
    });

    it('возвращает дерево с вложенностью', async () => {
      const root = await post({ projectId, title: 'root' }).expect(201);
      await post({ parentPageId: root.body.id, projectId, title: 'child' }).expect(201);

      const response = await request(context.app.getHttpServer())
        .get('/api/v1/pages')
        .set('Authorization', authorization)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].children).toHaveLength(1);
      expect(response.body[0].children[0].title).toBe('child');
    });
  });
});
