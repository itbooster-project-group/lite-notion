import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';

import { InMemoryInternalApiClient } from '../api/internal-api-client.in-memory.js';
import type { CollaborationConfig } from '../config/environment.js';
import type { CollaborationLogger } from '../logging/logger.js';
import { createCollaborationServer } from './collaboration-server.js';

const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const pageId = '550e8400-e29b-41d4-a716-446655440001';
const documentName = `page:${pageId}`;
const ownerToken = 'owner-token';

interface TestLogger extends CollaborationLogger {
  error: Mock<CollaborationLogger['error']>;
  info: Mock<CollaborationLogger['info']>;
  warn: Mock<CollaborationLogger['warn']>;
}

function createLogger(): TestLogger {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as TestLogger;
}

function createConfig(): CollaborationConfig {
  return {
    allowedOrigin: 'http://localhost:3000',
    apiBaseUrl: 'http://api.test',
    apiTimeoutMs: 2000,
    internalServiceToken: 'service-token-value-of-32-characters',
    nodeEnvironment: 'test',
    port: 0,
    redisHost: '127.0.0.1',
    redisPort: 6379,
    websocketMaxPayloadBytes: 1024 * 1024,
  };
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
  const websocketProvider = new HocuspocusProviderWebsocket({ WebSocketPolyfill, url });
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

  function createApi(): InMemoryInternalApiClient {
    const api = new InMemoryInternalApiClient();
    api.grant(pageId, ownerToken, ownerId, true);

    return api;
  }

  async function start(
    api: InMemoryInternalApiClient,
  ): Promise<{ logger: TestLogger; url: string }> {
    const logger = createLogger();
    // Redis отключён: синхронизация реплик проверяется отдельным тестом.
    const server = createCollaborationServer(createConfig(), api.asClient(), logger, {
      address: '127.0.0.1',
      debounce: 10,
      maxDebounce: 50,
      withRedis: false,
    });
    servers.push(server);
    await server.listen();

    return { logger, url: `ws://127.0.0.1:${server.address.port}` };
  }

  it('отклоняет missing token', async () => {
    const { url } = await start(createApi());
    const provider = createProvider(url, new Y.Doc(), '');
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('отклоняет неизвестный токен', async () => {
    const { logger, url } = await start(createApi());
    const provider = createProvider(url, new Y.Doc(), 'unknown-token');
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(logger.warn).toHaveBeenCalledWith(
      'collaboration authentication rejected',
      expect.objectContaining({ documentName }),
    );
  });

  it('отклоняет mismatched Origin', async () => {
    const { url } = await start(createApi());
    const provider = createProvider(
      url,
      new Y.Doc(),
      ownerToken,
      websocketWithOrigin('http://evil.example.com'),
    );
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('отклоняет пользователя без доступа к page', async () => {
    const api = createApi();
    api.users.set('stranger-token', 'stranger');
    const { url } = await start(api);
    const provider = createProvider(url, new Y.Doc(), 'stranger-token');
    providers.push(provider);
    const failed = vi.fn();
    provider.on('authenticationFailed', failed);

    await waitFor(() => failed.mock.calls.length > 0);

    expect(failed).toHaveBeenCalled();
  });

  it('синхронизирует два клиента одной page room', async () => {
    const api = createApi();
    const { url } = await start(api);
    const first = new Y.Doc();
    const second = new Y.Doc();
    const firstProvider = createProvider(url, first, ownerToken);
    const secondProvider = createProvider(url, second, ownerToken);
    providers.push(firstProvider, secondProvider);

    await waitFor(() => firstProvider.isSynced && secondProvider.isSynced);

    first.getText('content').insert(0, 'hello');

    await waitFor(() => second.getText('content').toString() === 'hello');

    expect(second.getText('content').toString()).toBe('hello');
  });

  it('сохраняет документ и загружает его после reload', async () => {
    const api = createApi();
    const { url } = await start(api);
    const first = new Y.Doc();
    const firstProvider = createProvider(url, first, ownerToken);
    providers.push(firstProvider);

    await waitFor(() => firstProvider.isSynced);
    first.getText('content').insert(0, 'persisted');

    await waitFor(() => first.getText('content').toString() === 'persisted');
    await new Promise((resolve) => setTimeout(resolve, 120));

    firstProvider.destroy();

    const reloaded = new Y.Doc();
    const reloadedProvider = createProvider(url, reloaded, ownerToken);
    providers.push(reloadedProvider);

    await waitFor(() => reloaded.getText('content').toString() === 'persisted');

    expect(reloaded.getText('content').toString()).toBe('persisted');
  });

  it('не сохраняет state после удаления страницы', async () => {
    const api = createApi();
    const { logger, url } = await start(api);
    const document = new Y.Doc();
    const provider = createProvider(url, document, ownerToken);
    providers.push(provider);

    await waitFor(() => provider.isSynced);

    api.deletePage(pageId);
    document.getText('content').insert(0, 'after delete');

    await waitFor(() =>
      logger.warn.mock.calls.some(
        ([message]) => message === 'collaboration document room closed after store rejection',
      ),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'collaboration document room closed after store rejection',
      expect.objectContaining({ documentName }),
    );
  });

  it('читатель подключается в режиме только для чтения', async () => {
    const api = new InMemoryInternalApiClient();
    api.grant(pageId, 'viewer-token', 'viewer-user', false);
    const { url } = await start(api);
    const document = new Y.Doc();
    const provider = createProvider(url, document, 'viewer-token');
    providers.push(provider);

    await waitFor(() => provider.isSynced);

    expect(provider.isSynced).toBe(true);
  });
});
