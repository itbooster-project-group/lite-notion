import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageRole } from '../page-permissions/constants';

import { TIPTAP_SCHEMA_VERSION } from '../pages/constants';
import { positionBetween } from '../pages/helpers';
import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { INTERNAL_ROUTE_PREFIX } from './constants';

const owner = '11111111-1111-1111-1111-111111111111';
const grantee = '22222222-2222-2222-2222-222222222222';
const stranger = '33333333-3333-3333-3333-333333333333';

describe('internal page access HTTP contract', () => {
  let context: HttpTestContext;
  let projectId: string;
  let pageId: string;
  let childPageId: string;

  beforeEach(async () => {
    context = await createHttpTestContext();

    const project = await context.projects.create({ name: 'Workspace', ownerId: owner });
    projectId = project.id;

    const page = await context.pages.insert({
      createdById: owner,
      ownerId: owner,
      parentPageId: null,
      position: positionBetween(null, null),
      projectId,
      title: 'page',
    });
    await context.documents.insertEmpty(page.id, TIPTAP_SCHEMA_VERSION);
    pageId = page.id;

    const child = await context.pages.insert({
      createdById: owner,
      ownerId: owner,
      parentPageId: page.id,
      position: positionBetween(null, null),
      projectId,
      title: 'child',
    });
    await context.documents.insertEmpty(child.id, TIPTAP_SCHEMA_VERSION);
    childPageId = child.id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  const access = async (userId: string, targetPageId: string) =>
    request(context.app.getHttpServer())
      .get(`/${INTERNAL_ROUTE_PREFIX}/pages/${targetPageId}/access`)
      .set('Authorization', `Bearer ${await context.signAccessToken(userId)}`);

  it('владелец получает роль owner с правом записи', async () => {
    const response = await access(owner, pageId);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      canWrite: true,
      pageId,
      role: PageRole.OWNER,
      userId: owner,
    });
  });

  it('читатель получает viewer без права записи', async () => {
    await context.permissions.upsert({
      grantedById: owner,
      pageId,
      role: 'VIEWER',
      userId: grantee,
    });

    const response = await access(grantee, pageId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ canWrite: false, role: PageRole.VIEWER });
  });

  it('редактор получает право записи', async () => {
    await context.permissions.upsert({
      grantedById: owner,
      pageId,
      role: 'EDITOR',
      userId: grantee,
    });

    const response = await access(grantee, pageId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ canWrite: true, role: PageRole.EDITOR });
  });

  it('унаследованное разрешение допускает к потомку в режиме inherit', async () => {
    await context.permissions.upsert({
      grantedById: owner,
      pageId,
      role: 'EDITOR',
      userId: grantee,
    });

    const response = await access(grantee, childPageId);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ canWrite: true, role: PageRole.EDITOR });
  });

  it('граница restricted отклоняет так же, как чужую страницу', async () => {
    await context.permissions.upsert({
      grantedById: owner,
      pageId,
      role: 'EDITOR',
      userId: grantee,
    });
    await context.pages.setAccessMode(childPageId, 'RESTRICTED');

    const behindBoundary = await access(grantee, childPageId);
    const foreignPage = await access(stranger, pageId);

    expect(behindBoundary.status).toBe(404);
    expect(behindBoundary.body.message).toBe(foreignPage.body.message);
  });

  it('удалённая страница отклоняется как несуществующая', async () => {
    await context.pages.markSubtreeDeleted(pageId, owner, new Date());

    const deleted = await access(owner, pageId);
    const missing = await access(owner, '44444444-4444-4444-4444-444444444444');

    expect(deleted.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(deleted.body.message).toBe(missing.body.message);
  });

  it('отклоняет обращение без токена и с чужой подписью', async () => {
    await request(context.app.getHttpServer())
      .get(`/${INTERNAL_ROUTE_PREFIX}/pages/${pageId}/access`)
      .expect(401);

    await request(context.app.getHttpServer())
      .get(`/${INTERNAL_ROUTE_PREFIX}/pages/${pageId}/access`)
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('решение совпадает с решением REST для той же пары', async () => {
    await context.permissions.upsert({
      grantedById: owner,
      pageId,
      role: 'VIEWER',
      userId: grantee,
    });
    const internal = await access(grantee, pageId);
    // Прикладной маршрут берёт личность из заголовков шлюза, внутренний — из токена;
    // сравнение имеет смысл именно потому, что источники разные.
    const rest = await request(context.app.getHttpServer())
      .get(`/api/v1/pages/${pageId}`)
      .set(context.identityOf(grantee))
      .expect(200);

    expect(internal.body.role).toBe(rest.body.accessRole);
  });
});
