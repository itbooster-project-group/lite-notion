import { randomUUID } from 'node:crypto';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import {
  createPrismaClient,
  type PrismaClient,
  TIPTAP_SCHEMA_VERSION,
} from '@lite-notion/database';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';

import { createCollaborationServer } from '../server/collaboration-server.js';

const jwtSecret = 'local-development-only-change-me-before-deploy';
const origin = 'http://localhost:3000';

function tokenFor(userId: string): string {
  return jwt.sign({ sid: randomUUID(), sub: userId }, jwtSecret, { expiresIn: 60 });
}

function websocketWithOrigin(originHeader: string): typeof WebSocket {
  return class WebSocketWithOrigin extends WebSocket {
    constructor(address: string | URL) {
      super(address, { headers: { origin: originHeader } });
    }
  } as typeof WebSocket;
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}

/**
 * Допуск к комнате на живой базе: роль вычисляется общим пакетом, а решение видно
 * снаружи — по тому, открылось ли соединение и сохранилась ли правка. Двойник
 * Prisma такое не покажет: право записи держит `connectionConfig.readOnly`, а не код.
 */
describe('collaboration room access on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let actorId: string;
  let projectId: string;

  const providers: HocuspocusProvider[] = [];
  const servers: ReturnType<typeof createCollaborationServer>[] = [];
  const createdPageIds: string[] = [];

  async function createPage(options: { restricted?: boolean; parentPageId?: string } = {}) {
    const id = randomUUID();

    await prisma.page.create({
      data: {
        accessMode: options.restricted === true ? 'RESTRICTED' : 'INHERIT',
        createdById: ownerId,
        document: {
          create: { tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION, yjsState: new Uint8Array() },
        },
        id,
        ownerId,
        parentPageId: options.parentPageId ?? null,
        position: 'a',
        projectId,
        title: id,
      },
    });
    createdPageIds.push(id);

    return id;
  }

  function grant(pageId: string, role: 'VIEWER' | 'EDITOR') {
    return prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role, userId: actorId },
    });
  }

  async function startServer() {
    const server = createCollaborationServer(
      {
        allowedOrigin: origin,
        databaseConnectionTimeoutMs: 5000,
        databaseUrl:
          process.env.DATABASE_URL ??
          'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
        jwtSecret,
        nodeEnvironment: 'test',
        port: 0,
        websocketMaxPayloadBytes: 1024 * 1024,
      },
      prisma,
      { error: () => {}, info: () => {}, warn: () => {} },
      { address: '127.0.0.1', debounce: 10, maxDebounce: 50 },
    );
    servers.push(server);
    await server.listen();

    return server;
  }

  function connect(
    server: ReturnType<typeof createCollaborationServer>,
    pageId: string,
    userId: string,
    document: Y.Doc,
  ): HocuspocusProvider & { rejected: () => boolean } {
    let rejected = false;
    const provider = new HocuspocusProvider({
      document,
      name: `page:${pageId}`,
      onAuthenticationFailed: () => {
        rejected = true;
      },
      token: tokenFor(userId),
      websocketProvider: new HocuspocusProviderWebsocket({
        WebSocketPolyfill: websocketWithOrigin(origin),
        url: `ws://127.0.0.1:${server.address.port}`,
      }),
    });
    providers.push(provider);
    provider.attach();

    return Object.assign(provider, { rejected: () => rejected });
  }

  /** Отказ наблюдается событием, а не отсутствием синхронизации: оно верно и до connect. */
  async function expectRejected(provider: ReturnType<typeof connect>): Promise<void> {
    await waitFor(() => provider.rejected());

    expect(provider.isSynced).toBe(false);
  }

  const storedText = async (pageId: string): Promise<string> => {
    const row = await prisma.pageDocument.findUnique({
      select: { yjsState: true },
      where: { pageId },
    });

    if (row === null || row.yjsState.length === 0) {
      return '';
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(row.yjsState));

    return doc.getText('body').toString();
  };

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    actorId = randomUUID();
    projectId = randomUUID();

    await prisma.user.createMany({
      data: [
        {
          email: `${ownerId}@room.integration.test`,
          id: ownerId,
          name: 'owner',
          passwordHash: 'test-hash',
        },
        {
          email: `${actorId}@room.integration.test`,
          id: actorId,
          name: 'actor',
          passwordHash: 'test-hash',
        },
      ],
    });
    await prisma.project.create({ data: { id: projectId, name: 'room', ownerId } });
  });

  afterEach(async () => {
    for (const provider of providers.splice(0)) {
      provider.destroy();
    }

    for (const server of servers.splice(0)) {
      await server.destroy();
    }

    for (const id of createdPageIds.splice(0).reverse()) {
      await prisma.page.deleteMany({ where: { id } });
    }

    await prisma.project.updateMany({ data: { deletedAt: null }, where: { id: projectId } });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, actorId] } } });
    await prisma.$disconnect();
  });

  it('открывает редактору соединение с записью и сохраняет его правку', async () => {
    const pageId = await createPage();
    await grant(pageId, 'EDITOR');
    const server = await startServer();
    const document = new Y.Doc();
    const provider = connect(server, pageId, actorId, document);

    await waitFor(() => provider.isSynced);
    document.getText('body').insert(0, 'by editor');

    await waitFor(async () => (await storedText(pageId)) === 'by editor');
  });

  it('открывает читателю соединение, но его правка не сохраняется', async () => {
    const pageId = await createPage();
    await grant(pageId, 'VIEWER');
    const server = await startServer();
    const document = new Y.Doc();
    const provider = connect(server, pageId, actorId, document);

    // Соединение именно открывается: читатель обязан видеть документ.
    await waitFor(() => provider.isSynced);
    document.getText('body').insert(0, 'by viewer');

    // Столько запись не занимает: debounce здесь 10 мс.
    await new Promise((resolve) => setTimeout(resolve, 400));

    await expect(storedText(pageId)).resolves.toBe('');
  });

  it('пускает по унаследованному разрешению с предка', async () => {
    const parentPageId = await createPage();
    const pageId = await createPage({ parentPageId });
    await grant(parentPageId, 'EDITOR');
    const server = await startServer();
    const document = new Y.Doc();
    const provider = connect(server, pageId, actorId, document);

    await waitFor(() => provider.isSynced);
    document.getText('body').insert(0, 'inherited');

    await waitFor(async () => (await storedText(pageId)) === 'inherited');
  });

  it('отклоняет соединение за границей restricted', async () => {
    const parentPageId = await createPage();
    const pageId = await createPage({ parentPageId, restricted: true });
    await grant(parentPageId, 'EDITOR');
    const server = await startServer();
    const provider = connect(server, pageId, actorId, new Y.Doc());

    await expectRejected(provider);
  });

  it('отклоняет соединение к странице удалённого проекта даже владельцу', async () => {
    const pageId = await createPage();
    await prisma.project.update({ data: { deletedAt: new Date() }, where: { id: projectId } });
    const server = await startServer();
    const provider = connect(server, pageId, ownerId, new Y.Doc());

    await expectRejected(provider);
  });

  it('отклоняет соединение постороннему без разрешений', async () => {
    const pageId = await createPage();
    const server = await startServer();
    const provider = connect(server, pageId, actorId, new Y.Doc());

    await expectRejected(provider);
  });
});
