import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { PROJECT_NAME_MAX_LENGTH } from './constants';

const owner = '11111111-1111-1111-1111-111111111111';

describe('projects HTTP contract', () => {
  let context: HttpTestContext;
  let authorization: string;

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = `Bearer ${await context.signAccessToken(owner)}`;
  });

  afterEach(async () => {
    await context.app.close();
  });

  const post = (body: unknown) =>
    request(context.app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', authorization)
      .send(body as object);

  it('создаёт проект и возвращает 201', async () => {
    const response = await post({ name: 'Workspace' }).expect(201);

    expect(response.body).toMatchObject({ name: 'Workspace', ownerId: owner });
  });

  it('отклоняет пустое имя', async () => {
    const response = await post({ name: '' }).expect(400);

    expect(response.body).toMatchObject({ error: 'Bad Request', statusCode: 400 });
  });

  it('отклоняет имя из одних пробелов', async () => {
    await post({ name: '   ' }).expect(400);
  });

  it('отклоняет слишком длинное имя', async () => {
    await post({ name: 'x'.repeat(PROJECT_NAME_MAX_LENGTH + 1) }).expect(400);
  });

  it('отклоняет лишнее поле', async () => {
    await post({ extra: true, name: 'Workspace' }).expect(400);
  });

  it('отклоняет ownerId от клиента', async () => {
    await post({ name: 'Workspace', ownerId: '00000000-0000-0000-0000-000000000000' }).expect(400);
  });

  it('возвращает только проекты текущего пользователя', async () => {
    await context.projects.create({ name: 'Not yours', ownerId: 'stranger' });
    await post({ name: 'Mine' }).expect(201);

    const response = await request(context.app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', authorization)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'Mine', ownerId: owner });
  });

  it('возвращает пустой список, а не ошибку', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/api/v1/projects')
      .set('Authorization', authorization)
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
