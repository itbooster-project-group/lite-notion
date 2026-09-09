import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import type { PrismaClient } from '@lite-notion/database';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';

import type { CollaborationConfig } from '../config/environment';
import type { CollaborationLogger } from '../logging/logger';
import { createCollaborationServer } from './collaboration-server';

const jwtSecret = 'local-development-only-change-me-before-deploy';
const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const pageId = '550e8400-e29b-41d4-a716-446655440001';
const documentName = `page:${pageId}`;

function tokenFor(userId: string): string {
  return jwt.sign({ sid: '550e8400-e29b-41d4-a716-446655440002', sub: userId }, jwtSecret, {
    expiresIn: 60,
  });
}

function createLogger(): CollaborationLogger {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

interface TestLogger extends CollaborationLogger {
  error: Mock<CollaborationLogger['error']>;
  info: Mock<CollaborationLogger['info']>;
  warn: Mock<CollaborationLogger['warn']>;
}

function createConfig(): CollaborationConfig {
  return {
    allowedOrigin: 'http://localhost:3000',
    databaseConnectionTimeoutMs: 5000,
    databaseUrl: 'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    jwtSecret,
    nodeEnvironment: 'test',
    port: 0,
    websocketMaxPayloadBytes: 1024 * 1024,
  };
}

interface StoredPage {
  deletedAt: Date | null;
  ownerId: string;
  yjsState: Uint8Array;
  storageRevision: number;
}

function createPrismaDouble(initial?: Partial<StoredPage>): PrismaClient {
  const stored: StoredPage = {
    deletedAt: null,
    ownerId,
    storageRevision: 0,
    yjsState: new Uint8Array(),
    ...initial,
  };

  const prisma = {
    __stored: stored,
    page: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; ownerId: string } }) => {
        if (where.id !== pageId || where.ownerId !== stored.ownerId || stored.deletedAt !== null) {
          return null;
        }

        return { id: pageId };
      }),
    },
    pageDocument: {
      findFirst: vi.fn(async ({ where }: { where: { pageId: string } }) => {
        if (where.pageId !== pageId || stored.deletedAt !== null) {
          return null;
        }

        return { yjsState: stored.yjsState };
      }),
      updateMany: vi.fn(
        async ({
          data,
          where,
        }: {
          data: { storageRevision: { increment: number }; yjsState: Uint8Array };
          where: { pageId: string };
        }) => {
          if (where.pageId !== pageId || stored.deletedAt !== null) {
            return { count: 0 };
          }

          stored.yjsState = data.yjsState;
          stored.storageRevision += data.storageRevision.increment;

          return { count: 1 };
        },
      ),
    },
  };

  return prisma as unknown as PrismaClient;
}

function websocketWithOrigin(origin: string): typeof WebSocket {
  return class WebSocketWithOrigin extends WebSocket {
    constructor(address: string | URL) {
      super(address, { headers: { origin } });
    }
  } as typeof WebSocket;
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}

function createProvider(
  url: string,
  document: Y.Doc,
  token: string,
  WebSocketPolyfill: typeof WebSocket = websocketWithOrigin('http://localhost:3000'),
): HocuspocusProvider {
  const websocketProvider = new HocuspocusProviderWebsocket({
    WebSocketPolyfill,
    url,
  });

  const provider = new HocuspocusProvider({
    document,
    name: documentName,
    token,
    websocketProvider,
  });

  provider.attach();

  return provider;
}

describe('collaboration Hocuspocus runtime', () => {
  const providers: HocuspocusProvider[] = [];
  const servers: ReturnType<typeof createCollaborationServer>[] = [];

  afterEach(async () => {
    for (const provider of providers.splice(0)) {
      provider.destroy();
    }

    for (const server of servers.splice(0)) {
      await server.destroy();
    }
  });

  async function start(
    prisma: PrismaClient = createPrismaDouble(),
  ): Promise<{ logger: TestLogger; url: string }> {
    const logger = createLogger() as TestLogger;
    const server = createCollaborationServer(createConfig(), prisma, logger, {
      address: '127.0.0.1',
      debounce: 10,
      maxDebounce: 50,
    });
    servers.push(server);
    await server.listen();

    return { logger, url: `ws://127.0.0.1:${server.address.port}` };
  }

  it('отклоняет missing token', async () => {
    const { url } = await start();
    const provider = createProvider(url, new Y.Doc(), '');
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('отклоняет invalid token', async () => {
    const { logger, url } = await start();
    const token = 'not-a-jwt';
    const provider = createProvider(url, new Y.Doc(), token);
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(token);
  });

  it('отклоняет mismatched Origin', async () => {
    const { url } = await start();
    const provider = createProvider(
      url,
      new Y.Doc(),
      tokenFor(ownerId),
      websocketWithOrigin('http://evil.example'),
    );
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('отклоняет пользователя без доступа к page', async () => {
    const { url } = await start();
    const provider = createProvider(
      url,
      new Y.Doc(),
      tokenFor('550e8400-e29b-41d4-a716-446655440099'),
    );
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('синхронизирует два клиента одной page room', async () => {
    const { url } = await start();
    const first = new Y.Doc();
    const second = new Y.Doc();
    providers.push(createProvider(url, first, tokenFor(ownerId)));
    providers.push(createProvider(url, second, tokenFor(ownerId)));

    await waitFor(() => providers.every((provider) => provider.isSynced));
    first.getText('body').insert(0, 'A');

    await waitFor(() => second.getText('body').toString() === 'A');
    second.getText('body').insert(1, 'B');

    await waitFor(() => first.getText('body').toString() === 'AB');
    expect(second.getText('body').toString()).toBe('AB');
  });

  it('сохраняет документ и загружает его после reload', async () => {
    const prisma = createPrismaDouble();
    const { url } = await start(prisma);
    const first = new Y.Doc();
    providers.push(createProvider(url, first, tokenFor(ownerId)));

    await waitFor(() => providers[0]?.isSynced === true);
    first.getText('body').insert(0, 'persisted');

    const stored = (prisma as unknown as { __stored: StoredPage }).__stored;
    await waitFor(() => stored.storageRevision === 1);
    await servers[0]?.destroy();
    servers.splice(0);

    expect(stored.storageRevision).toBe(1);

    const { url: nextUrl } = await start(prisma);
    const second = new Y.Doc();
    providers.push(createProvider(nextUrl, second, tokenFor(ownerId)));

    await waitFor(() => second.getText('body').toString() === 'persisted');
  });

  it('не сохраняет state после soft delete', async () => {
    const prisma = createPrismaDouble();
    const stored = (prisma as unknown as { __stored: StoredPage }).__stored;
    const { url } = await start(prisma);
    const document = new Y.Doc();
    providers.push(createProvider(url, document, tokenFor(ownerId)));

    await waitFor(() => providers[0]?.isSynced === true);
    stored.deletedAt = new Date();
    document.getText('body').insert(0, 'after delete');
    await servers[0]?.destroy();
    servers.splice(0);

    expect(stored.storageRevision).toBe(0);
  });
});
