import { PageRole } from '@lite-notion/page-permissions';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHttpTestContext, type HttpTestContext } from '../testing/http-application';
import { positionBetween } from './helpers';

const owner = '11111111-1111-1111-1111-111111111111';
const actor = '22222222-2222-2222-2222-222222222222';

interface SharedNode {
  id: string;
  title: string;
  accessRole: string;
  accessMode: string;
  children: SharedNode[];
}

describe('shared pages HTTP contract', () => {
  let context: HttpTestContext;
  let authorization: string;
  let ownerProjectId: string;

  const addPage = async (title: string, parentPageId: string | null = null) => {
    const page = await context.pages.insert({
      createdById: owner,
      ownerId: owner,
      parentPageId,
      position: positionBetween(null, null),
      projectId: ownerProjectId,
      title,
    });

    return page.id;
  };

  const shared = () =>
    request(context.app.getHttpServer())
      .get('/api/v1/pages/shared')
      .set('Authorization', authorization)
      .send();

  const flatten = (nodes: SharedNode[]): SharedNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children)]);

  beforeEach(async () => {
    context = await createHttpTestContext();
    authorization = `Bearer ${await context.signAccessToken(actor)}`;
    ownerProjectId = (await context.projects.create({ name: 'Theirs', ownerId: owner })).id;
  });

  afterEach(async () => {
    await context.app.close();
  });

  it('маршрут не перехватывается параметрическим и отдаёт пустой список', async () => {
    const response = await shared();

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('возвращает чужое поддерево с ролью в каждом узле', async () => {
    const root = await addPage('root');
    const child = await addPage('child', root);
    context.permissions.grant(root, actor, PageRole.EDITOR);

    const response = await shared();

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ accessRole: 'editor', id: root });
    expect(response.body[0].children).toHaveLength(1);
    expect(response.body[0].children[0]).toMatchObject({ accessRole: 'editor', id: child });
  });

  it('показывает ближайшую роль на вложенном узле, а не роль корня', async () => {
    const root = await addPage('root');
    const nested = await addPage('nested', root);
    const leaf = await addPage('leaf', nested);
    context.permissions.grant(root, actor, PageRole.EDITOR);
    context.permissions.grant(nested, actor, PageRole.VIEWER);

    const byId = new Map(flatten((await shared()).body).map((node) => [node.id, node]));

    expect(byId.get(root)?.accessRole).toBe('editor');
    expect(byId.get(nested)?.accessRole).toBe('viewer');
    expect(byId.get(leaf)?.accessRole).toBe('viewer');
  });

  it('не показывает собственных страниц спрашивающего', async () => {
    const ownProject = await context.projects.create({ name: 'Mine', ownerId: actor });
    const own = await context.pages.insert({
      createdById: actor,
      ownerId: actor,
      parentPageId: null,
      position: positionBetween(null, null),
      projectId: ownProject.id,
      title: 'mine',
    });
    const root = await addPage('root');
    context.permissions.grant(root, actor, PageRole.VIEWER);

    const ids = flatten((await shared()).body).map((node) => node.id);

    expect(ids).toContain(root);
    expect(ids).not.toContain(own.id);
  });

  it('обрезает выдачу на границе restricted', async () => {
    const root = await addPage('root');
    const boundary = await addPage('boundary', root);
    const behind = await addPage('behind', boundary);
    context.permissions.grant(root, actor, PageRole.EDITOR);

    const stored = context.pages.pages.get(boundary);

    if (stored !== undefined) {
      stored.accessMode = 'RESTRICTED';
    }

    const ids = flatten((await shared()).body).map((node) => node.id);

    expect(ids).toEqual([root]);
    expect(ids).not.toContain(boundary);
    expect(ids).not.toContain(behind);
  });

  it('перестаёт показывать удалённую страницу', async () => {
    const root = await addPage('root');
    context.permissions.grant(root, actor, PageRole.EDITOR);

    const stored = context.pages.pages.get(root);

    if (stored !== undefined) {
      stored.deletedAt = new Date();
      stored.deletedOrigin = 'SELF';
    }

    await expect(shared().then((response) => response.body)).resolves.toEqual([]);
  });

  it('требует аутентификацию', async () => {
    await request(context.app.getHttpServer()).get('/api/v1/pages/shared').send().expect(401);
  });
});
