import { randomBytes } from 'node:crypto';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DOCUMENT_MAX_BYTES, TIPTAP_SCHEMA_VERSION } from '../pages/constants';
import { positionBetween } from '../pages/helpers';
import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { INTERNAL_ROUTE_PREFIX, INTERNAL_SERVICE_TOKEN_HEADER } from './constants';

const owner = '11111111-1111-1111-1111-111111111111';
const serviceToken = 'local-development-only-change-me-before-deploy';

describe('internal page document HTTP contract', () => {
  let context: HttpTestContext;
  let pageId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();

    const project = await context.projects.create({ name: 'Workspace', ownerId: owner });
    const page = await context.pages.insert({
      createdById: owner,
      ownerId: owner,
      parentPageId: null,
      position: positionBetween(null, null),
      projectId: project.id,
      title: 'page',
    });
    await context.documents.insertEmpty(page.id, TIPTAP_SCHEMA_VERSION);
    pageId = page.id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  const path = (id = pageId) => `/${INTERNAL_ROUTE_PREFIX}/pages/${id}/document`;

  const read = (id = pageId) =>
    request(context.app.getHttpServer())
      .get(path(id))
      .set(INTERNAL_SERVICE_TOKEN_HEADER, serviceToken);

  const write = (yjsState: string, id = pageId) =>
    request(context.app.getHttpServer())
      .put(path(id))
      .set(INTERNAL_SERVICE_TOKEN_HEADER, serviceToken)
      .send({ yjsState });

  it('читает пустой документ только что созданной страницы', async () => {
    const response = await read().expect(200);

    expect(response.body).toEqual({ pageId, yjsState: '' });
  });

  it('сохраняет состояние и отдаёт его следующим чтением', async () => {
    const state = randomBytes(64).toString('base64');

    await write(state).expect(200);

    expect((await read().expect(200)).body.yjsState).toBe(state);
  });

  it('инкрементирует storageRevision и не трогает tiptapSchemaVersion', async () => {
    const revisionBefore = context.documents.documents.get(pageId)?.storageRevision ?? 0;

    await write(randomBytes(32).toString('base64')).expect(200);

    const after = context.documents.documents.get(pageId);

    expect(after?.storageRevision).toBe(revisionBefore + 1);
    expect(after?.tiptapSchemaVersion).toBe(TIPTAP_SCHEMA_VERSION);
  });

  it('принимает содержимое предельного размера', async () => {
    await write(randomBytes(DOCUMENT_MAX_BYTES - 1024).toString('base64')).expect(200);
  });

  it('отклоняет содержимое сверх предела, не меняя сохранённое', async () => {
    const kept = randomBytes(16).toString('base64');
    await write(kept).expect(200);

    await write(randomBytes(DOCUMENT_MAX_BYTES + 1024).toString('base64')).expect(400);

    expect((await read().expect(200)).body.yjsState).toBe(kept);
  });

  it('отличает удалённую страницу от временной ошибки', async () => {
    await context.pages.markSubtreeDeleted(pageId, owner, new Date());

    await write(randomBytes(16).toString('base64')).expect(404);
    await read().expect(404);
  });

  it('требует сервисный креденшл на чтение и запись', async () => {
    await request(context.app.getHttpServer()).get(path()).expect(401);
    await request(context.app.getHttpServer()).put(path()).send({ yjsState: '' }).expect(401);
    await request(context.app.getHttpServer())
      .get(path())
      .set(INTERNAL_SERVICE_TOKEN_HEADER, 'wrong-token')
      .expect(401);
  });

  it('пользовательский токен не заменяет сервисный креденшл', async () => {
    await request(context.app.getHttpServer())
      .get(path())
      .set('Authorization', `Bearer ${await context.signAccessToken(owner)}`)
      .expect(401);
  });
});
