import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { positionBetween } from '../pages/helpers';
import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';

const owner = '11111111-1111-1111-1111-111111111111';
const teammate = '22222222-2222-2222-2222-222222222222';
const outsider = '44444444-4444-4444-4444-444444444444';
const missingId = '33333333-3333-4333-8333-333333333333';

describe('page permissions HTTP contract', () => {
  let context: HttpTestContext;
  let authorization: string;
  let pageId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = `Bearer ${await context.signAccessToken(owner)}`;

    const project = await context.projects.create({ name: 'Workspace', ownerId: owner });
    const page = await context.pages.insert({
      createdById: owner,
      ownerId: owner,
      parentPageId: null,
      position: positionBetween(null, null),
      projectId: project.id,
      title: 'page',
    });

    pageId = page.id;
    // Пользователи известны репозиторию разрешений: список показывает email и имя.
    context.permissions.users.set(teammate, { email: 'teammate@example.com', name: 'Teammate' });
    context.permissions.users.set(owner, { email: 'owner@example.com', name: 'Owner' });
  });

  afterEach(async () => {
    await context.app.close();
  });

  const grant = (body: object, auth = authorization) =>
    request(context.app.getHttpServer())
      .put(`/api/v1/pages/${pageId}/permissions`)
      .set('Authorization', auth)
      .send(body);

  const list = (auth = authorization) =>
    request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}/permissions`)
      .set('Authorization', auth)
      .send();

  const revoke = (userId: string, auth = authorization) =>
    request(context.app.getHttpServer())
      .delete(`/api/v1/pages/${pageId}/permissions/${userId}`)
      .set('Authorization', auth)
      .send();

  it('выдаёт разрешение и возвращает его', async () => {
    const response = await grant({ email: 'teammate@example.com', role: 'viewer' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: 'teammate@example.com',
      role: 'viewer',
      userId: teammate,
    });
  });

  it('меняет роль повторной выдачей, не создавая второй записи', async () => {
    await grant({ email: 'teammate@example.com', role: 'viewer' });

    const changed = await grant({ email: 'teammate@example.com', role: 'editor' });
    const listed = await list();

    expect(changed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({ role: 'editor', userId: teammate });
  });

  it('нормализует email перед поиском пользователя', async () => {
    const response = await grant({ email: '  TeamMate@Example.COM ', role: 'viewer' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ userId: teammate });
  });

  it('отклоняет выдачу владельцу этой же страницы', async () => {
    const response = await grant({ email: 'owner@example.com', role: 'editor' });

    expect(response.status).toBe(400);
  });

  it('отвечает 404 на незарегистрированный email', async () => {
    const response = await grant({ email: 'nobody@example.com', role: 'viewer' });

    expect(response.status).toBe(404);
  });

  it('отклоняет роль owner и лишнее поле', async () => {
    await expect(
      grant({ email: 'teammate@example.com', role: 'owner' }).then((r) => r.status),
    ).resolves.toBe(400);
    await expect(
      grant({ email: 'teammate@example.com', extra: 1, role: 'viewer' }).then((r) => r.status),
    ).resolves.toBe(400);
  });

  it('читает список в детерминированном порядке и без унаследованных разрешений', async () => {
    context.permissions.users.set(outsider, { email: 'alex@example.com', name: 'Alex' });
    await grant({ email: 'teammate@example.com', role: 'viewer' });
    await grant({ email: 'alex@example.com', role: 'editor' });

    const first = await list();
    const second = await list();

    expect(first.body.map((row: { email: string }) => row.email)).toEqual([
      'alex@example.com',
      'teammate@example.com',
    ]);
    expect(second.body).toEqual(first.body);
  });

  it('возвращает пустой список, а не ошибку', async () => {
    const response = await list();

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('отзывает разрешение и отвечает 404 на повторный отзыв', async () => {
    await grant({ email: 'teammate@example.com', role: 'editor' });

    const revoked = await revoke(teammate);
    const repeated = await revoke(teammate);

    expect(revoked.status).toBe(204);
    expect(repeated.status).toBe(404);
    await expect(list().then((r) => r.body)).resolves.toEqual([]);
  });

  describe('управлять доступом может только владелец', () => {
    let editorAuthorization: string;

    beforeEach(async () => {
      editorAuthorization = `Bearer ${await context.signAccessToken(teammate)}`;
      context.permissions.grant(pageId, teammate, 'editor');
    });

    it('редактор не выдаёт разрешения', async () => {
      const response = await grant(
        { email: 'teammate@example.com', role: 'viewer' },
        editorAuthorization,
      );

      expect(response.status).toBe(403);
    });

    it('редактор не читает список', async () => {
      expect((await list(editorAuthorization)).status).toBe(403);
    });

    it('редактор не отзывает разрешения', async () => {
      expect((await revoke(teammate, editorAuthorization)).status).toBe(403);
    });

    it('посторонний получает 404, а не 403', async () => {
      const outsiderAuthorization = `Bearer ${await context.signAccessToken(outsider)}`;

      expect((await list(outsiderAuthorization)).status).toBe(404);
      expect((await revoke(teammate, outsiderAuthorization)).status).toBe(404);
    });
  });

  it('недоступная и несуществующая страница неразличимы', async () => {
    const outsiderAuthorization = `Bearer ${await context.signAccessToken(outsider)}`;

    const inaccessible = await list(outsiderAuthorization);
    const missing = await request(context.app.getHttpServer())
      .get(`/api/v1/pages/${missingId}/permissions`)
      .set('Authorization', outsiderAuthorization)
      .send();

    expect(inaccessible.status).toBe(404);
    expect(missing.status).toBe(404);
    expect({ ...inaccessible.body, path: undefined, timestamp: undefined }).toEqual({
      ...missing.body,
      path: undefined,
      timestamp: undefined,
    });
  });

  it('требует аутентификацию', async () => {
    await request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}/permissions`)
      .send()
      .expect(401);
  });
});
