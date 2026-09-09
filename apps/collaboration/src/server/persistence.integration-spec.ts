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

import { createCollaborationServer } from './collaboration-server';

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

describe('collaboration persistence on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let projectId: string;
  let pageId: string;
  let documentName: string;
  const providers: HocuspocusProvider[] = [];
  const servers: ReturnType<typeof createCollaborationServer>[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    projectId = randomUUID();
    pageId = randomUUID();
    documentName = `page:${pageId}`;

    await prisma.user.create({
      data: {
        email: `${ownerId}@collaboration.integration.test`,
        id: ownerId,
        name: 'collaboration integration owner',
        passwordHash: 'test-hash',
      },
    });
    await prisma.project.create({ data: { id: projectId, name: 'integration', ownerId } });
    await prisma.page.create({
      data: {
        createdById: ownerId,
        document: {
          create: {
            tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
            yjsState: new Uint8Array(),
          },
        },
        id: pageId,
        ownerId,
        position: 'a',
        projectId,
        title: 'collaboration integration',
      },
    });
  });

  afterEach(async () => {
    for (const provider of providers.splice(0)) {
      provider.destroy();
    }

    for (const server of servers.splice(0)) {
      await server.destroy();
    }
  });

  afterAll(async () => {
    await prisma.page.deleteMany({ where: { id: pageId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  function startServer() {
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

    return server;
  }

  function connect(server: ReturnType<typeof createCollaborationServer>, document: Y.Doc) {
    const websocketProvider = new HocuspocusProviderWebsocket({
      WebSocketPolyfill: websocketWithOrigin(origin),
      url: `ws://127.0.0.1:${server.address.port}`,
    });
    const provider = new HocuspocusProvider({
      document,
      name: documentName,
      token: tokenFor(ownerId),
      websocketProvider,
    });
    providers.push(provider);
    provider.attach();

    return provider;
  }

  it('сохраняет, перезагружает и защищает документ после soft delete', async () => {
    const server = startServer();
    await server.listen();
    const first = new Y.Doc();
    const firstProvider = connect(server, first);

    await waitFor(() => firstProvider.isSynced);
    first.getText('body').insert(0, 'persisted');
    await waitFor(async () => {
      const row = await prisma.pageDocument.findUnique({
        select: { storageRevision: true },
        where: { pageId },
      });
      return row?.storageRevision === 1n;
    });

    const stored = await prisma.pageDocument.findUniqueOrThrow({
      select: { storageRevision: true, tiptapSchemaVersion: true, yjsState: true },
      where: { pageId },
    });
    const storedDocument = new Y.Doc();
    Y.applyUpdate(storedDocument, stored.yjsState);
    expect(storedDocument.getText('body').toString()).toBe('persisted');
    expect(stored.storageRevision).toBe(1n);
    expect(stored.tiptapSchemaVersion).toBe(TIPTAP_SCHEMA_VERSION);

    firstProvider.destroy();
    await server.destroy();
    servers.splice(servers.indexOf(server), 1);

    const reloadedServer = startServer();
    await reloadedServer.listen();
    const reloaded = new Y.Doc();
    const reloadedProvider = connect(reloadedServer, reloaded);
    await waitFor(() => reloadedProvider.isSynced);
    await waitFor(() => reloaded.getText('body').toString() === 'persisted');

    await prisma.page.update({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: pageId },
    });
    reloaded.getText('body').insert(9, ' after delete');
    await waitFor(() => reloadedServer.hocuspocus.getConnectionsCount() === 0);

    reloadedProvider.destroy();
    const unchanged = await prisma.pageDocument.findUniqueOrThrow({
      select: { storageRevision: true, yjsState: true },
      where: { pageId },
    });
    expect(unchanged.storageRevision).toBe(1n);
    const unchangedDocument = new Y.Doc();
    Y.applyUpdate(unchangedDocument, unchanged.yjsState);
    expect(unchangedDocument.getText('body').toString()).toBe('persisted');

    await prisma.page.update({
      data: { deletedAt: null, deletedOrigin: null },
      where: { id: pageId },
    });
    const restored = new Y.Doc();
    const restoredProvider = connect(reloadedServer, restored);
    await waitFor(() => restoredProvider.isSynced);
    await waitFor(() => restored.getText('body').toString() === 'persisted');
    expect(restored.getText('body').toString()).not.toContain('after delete');
  });
});
