import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../../testing/http-application';
import { DOCUMENT_MAX_BYTES, TIPTAP_SCHEMA_VERSION } from '../constants';

const owner = '11111111-1111-1111-1111-111111111111';

describe('page document HTTP contract', () => {
  let context: HttpTestContext;
  let authorization: string;
  let pageId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = `Bearer ${await context.signAccessToken(owner)}`;

    const project = await context.projects.create({ name: 'Workspace', ownerId: owner });
    const page = await context.pages.create({
      createdById: owner,
      ownerId: owner,
      parentPageId: null,
      projectId: project.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title: 'page',
    });

    pageId = page.id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  const read = () =>
    request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}/document`)
      .set('Authorization', authorization);

  const write = (body: unknown) =>
    request(context.app.getHttpServer())
      .put(`/api/v1/pages/${pageId}/document`)
      .set('Authorization', authorization)
      .send(body as object);

  it('возвращает пустой документ только что созданной страницы', async () => {
    const response = await read().expect(200);

    expect(response.body).toEqual({
      pageId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: '',
    });
  });

  it('записывает содержимое и возвращает его при чтении', async () => {
    const state = randomBytes(64).toString('base64');

    await write({ tiptapSchemaVersion: 2, yjsState: state }).expect(200);

    const response = await read().expect(200);

    expect(response.body).toEqual({ pageId, tiptapSchemaVersion: 2, yjsState: state });
  });

  it('заменяет содержимое целиком при повторной записи', async () => {
    const first = randomBytes(32).toString('base64');
    const second = randomBytes(8).toString('base64');

    await write({ tiptapSchemaVersion: 1, yjsState: first }).expect(200);
    await write({ tiptapSchemaVersion: 1, yjsState: second }).expect(200);

    const response = await read().expect(200);

    expect(response.body.yjsState).toBe(second);
  });

  it('принимает пустое содержимое', async () => {
    await write({ tiptapSchemaVersion: 1, yjsState: '' }).expect(200);
  });

  it('не возвращает счётчик ревизии', async () => {
    await write({ tiptapSchemaVersion: 1, yjsState: '' }).expect(200);

    const response = await read().expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'pageId',
      'tiptapSchemaVersion',
      'yjsState',
    ]);
  });

  it('отклоняет содержимое не в base64', async () => {
    const response = await write({ tiptapSchemaVersion: 1, yjsState: 'not base64!!' }).expect(400);

    expect(response.body).toMatchObject({ error: 'Bad Request', statusCode: 400 });
  });

  it('отклоняет запрос без версии схемы', async () => {
    await write({ yjsState: '' }).expect(400);
  });

  it('отклоняет лишнее поле', async () => {
    await write({ extra: true, tiptapSchemaVersion: 1, yjsState: '' }).expect(400);
  });

  it('отклоняет storageRevision от клиента', async () => {
    await write({ storageRevision: 5, tiptapSchemaVersion: 1, yjsState: '' }).expect(400);
  });

  it('отклоняет содержимое сверх предела и не меняет сохранённое', async () => {
    const kept = randomBytes(16).toString('base64');
    await write({ tiptapSchemaVersion: 1, yjsState: kept }).expect(200);

    const oversized = randomBytes(DOCUMENT_MAX_BYTES + 1024).toString('base64');

    await write({ tiptapSchemaVersion: 1, yjsState: oversized }).expect(400);

    const response = await read().expect(200);

    expect(response.body.yjsState).toBe(kept);
  });

  it('принимает содержимое у самого предела', async () => {
    const nearLimit = randomBytes(DOCUMENT_MAX_BYTES - 1024).toString('base64');

    await write({ tiptapSchemaVersion: 1, yjsState: nearLimit }).expect(200);
  });

  it('не затрагивает дерево при записи содержимого', async () => {
    const before = await request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}`)
      .set('Authorization', authorization)
      .expect(200);

    await write({ tiptapSchemaVersion: 9, yjsState: randomBytes(8).toString('base64') }).expect(
      200,
    );

    const after = await request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}`)
      .set('Authorization', authorization)
      .expect(200);

    expect(after.body).toEqual(before.body);
  });

  it('не публикует отдельных маршрутов создания и удаления документа', async () => {
    await request(context.app.getHttpServer())
      .post(`/api/v1/pages/${pageId}/document`)
      .set('Authorization', authorization)
      .send({ tiptapSchemaVersion: 1, yjsState: '' })
      .expect(404);

    await request(context.app.getHttpServer())
      .delete(`/api/v1/pages/${pageId}/document`)
      .set('Authorization', authorization)
      .expect(404);
  });
});
