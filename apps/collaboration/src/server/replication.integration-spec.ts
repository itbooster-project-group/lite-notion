import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';

import { InMemoryInternalApiClient } from '../api/internal-api-client.in-memory.js';
import type { CollaborationConfig } from '../config/environment.js';
import type { CollaborationLogger } from '../logging/logger.js';
import { createCollaborationServer } from './collaboration-server.js';

/**
 * Требует поднятого Redis: `pnpm db:up`. Проверяет ровно то, ради чего он введён, —
 * что клиенты одной комнаты на разных экземплярах видят друг друга.
 */
const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const pageId = '550e8400-e29b-41d4-a716-446655440001';
const documentName = `page:${pageId}`;
const ownerToken = 'owner-token';

function config(): CollaborationConfig {
  return {
    allowedOrigin: 'http://localhost:3000',
    apiBaseUrl: 'http://api.test',
    apiTimeoutMs: 2000,
    internalServiceToken: 'service-token-value-of-32-characters',
    nodeEnvironment: 'test',
    port: 0,
    redisHost: process.env.REDIS_HOST ?? '127.0.0.1',
    redisPort: Number(process.env.REDIS_PORT ?? 6379),
    websocketMaxPayloadBytes: 1024 * 1024,
  };
}

function logger(): CollaborationLogger {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
}

function websocketWithOrigin(origin: string): typeof WebSocket {
  return class extends WebSocket {
    constructor(address: string | URL) {
      super(address, { headers: { origin } });
    }
  } as typeof WebSocket;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 8000;

  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition');
}

function connect(url: string, document: Y.Doc, user: { id: string; name: string }) {
  const websocketProvider = new HocuspocusProviderWebsocket({
    WebSocketPolyfill: websocketWithOrigin('http://localhost:3000'),
    url,
  });
  const provider = new HocuspocusProvider({
    document,
    name: documentName,
    token: ownerToken,
    websocketProvider,
  });

  provider.attach();
  provider.setAwarenessField('user', user);

  return provider;
}

describe('репликация между экземплярами', () => {
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

  async function startInstance(api: InMemoryInternalApiClient): Promise<string> {
    const server = createCollaborationServer(config(), api.asClient(), logger(), {
      address: '127.0.0.1',
      debounce: 20,
      maxDebounce: 100,
    });
    servers.push(server);
    await server.listen();

    return `ws://127.0.0.1:${server.address.port}`;
  }

  it('клиенты на разных экземплярах видят изменения друг друга', async () => {
    const api = new InMemoryInternalApiClient();
    api.grant(pageId, ownerToken, ownerId, true);

    const firstUrl = await startInstance(api);
    const secondUrl = await startInstance(api);

    const first = new Y.Doc();
    const second = new Y.Doc();
    const firstProvider = connect(firstUrl, first, { id: ownerId, name: 'First' });
    const secondProvider = connect(secondUrl, second, { id: 'second-user', name: 'Second' });
    providers.push(firstProvider, secondProvider);

    await waitFor(() => firstProvider.isSynced && secondProvider.isSynced);

    first.getText('content').insert(0, 'from first instance');

    await waitFor(() => second.getText('content').toString() === 'from first instance');

    expect(second.getText('content').toString()).toBe('from first instance');
  });

  it('список участников одинаков на разных экземплярах', async () => {
    const api = new InMemoryInternalApiClient();
    api.grant(pageId, ownerToken, ownerId, true);

    const firstUrl = await startInstance(api);
    const secondUrl = await startInstance(api);

    const firstProvider = connect(firstUrl, new Y.Doc(), { id: ownerId, name: 'First' });
    const secondProvider = connect(secondUrl, new Y.Doc(), { id: 'second-user', name: 'Second' });
    providers.push(firstProvider, secondProvider);

    await waitFor(() => firstProvider.isSynced && secondProvider.isSynced);
    await waitFor(
      () =>
        firstProvider.awareness !== null &&
        secondProvider.awareness !== null &&
        firstProvider.awareness.getStates().size >= 2 &&
        secondProvider.awareness.getStates().size >= 2,
    );

    expect(firstProvider.awareness?.getStates().size).toBe(
      secondProvider.awareness?.getStates().size,
    );
  });
});
