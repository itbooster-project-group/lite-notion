import type { Redis } from '@hocuspocus/extension-redis';
import { type Connection, Server } from '@hocuspocus/server';

import {
  ApiDeniedError,
  type InternalApiClient,
  type VerifiedIdentity,
} from '../api/internal-api-client.js';
import { assertAllowedOrigin } from '../auth/origin.js';
import type { CollaborationConfig } from '../config/environment.js';
import { parsePageDocumentName } from '../documents/document-name.js';
import { type PageAccess, PageAccessService } from '../documents/page-access.js';
import {
  DocumentSizeLimitExceededError,
  DocumentStoreSkippedError,
  PageDocumentPersistence,
} from '../documents/persistence.js';
import type { CollaborationLogger } from '../logging/logger.js';
import { createBroker } from './broker-readiness.js';
import { createReauthorizationSchedule, type ReauthorizationSchedule } from './reauthorization.js';

export interface CollaborationContext {
  /** Срок жизни токена этого соединения, а не последнего вошедшего в комнату. */
  expiresAt: Date;
  pageAccess: PageAccess;
  sessionId: string;
}

export interface CollaborationRuntime {
  destroy(): Promise<void>;
  listen(): Promise<unknown>;
}

export interface CollaborationServerOptions {
  address?: string;
  /** Уже проверенный на доступность брокер: сервер не создаёт второе подключение. */
  broker?: Redis;
  debounce?: number;
  maxDebounce?: number;
  /** Позволяет тесту управлять временем, не дожидаясь реальных сроков. */
  schedule?: ReauthorizationSchedule;
  /** Отключает Redis в тестах, которым не нужна синхронизация реплик. */
  withRedis?: boolean;
}

function extractAccessToken(token: string, headers: Headers): string {
  if (token !== '') {
    return token;
  }

  const authorization = headers.get('authorization');
  const [scheme, credentials] = authorization?.split(' ') ?? [];

  if (scheme?.toLowerCase() === 'bearer' && credentials) {
    return credentials;
  }

  throw new ApiDeniedError(401);
}

export function createCollaborationServer(
  config: CollaborationConfig,
  api: InternalApiClient,
  logger: CollaborationLogger,
  options: CollaborationServerOptions = {},
): Server<CollaborationContext> {
  const access = new PageAccessService(api);
  const persistence = new PageDocumentPersistence(api);
  const schedule = options.schedule ?? createReauthorizationSchedule();

  const authorize = async (
    token: string,
    documentName: string,
  ): Promise<{ identity: VerifiedIdentity; pageAccess: PageAccess }> => {
    const identity = await api.authenticate(token);
    const { pageId } = parsePageDocumentName(documentName);

    return { identity, pageAccess: await access.authorize(token, pageId) };
  };

  return new Server<CollaborationContext>({
    name: 'lite-notion-collaboration',
    ...(options.address ? { address: options.address } : {}),
    ...(typeof options.debounce === 'number' ? { debounce: options.debounce } : {}),
    ...(typeof options.maxDebounce === 'number' ? { maxDebounce: options.maxDebounce } : {}),
    ...(options.withRedis === false
      ? {}
      : { extensions: [options.broker ?? createBroker(config)] }),
    port: config.port,
    quiet: true,
    stopOnSignals: false,
    unloadImmediately: false,
    websocketOptions: {
      maxPayload: config.websocketMaxPayloadBytes,
    },
    async onAuthenticate({ connectionConfig, documentName, requestHeaders, token }) {
      try {
        assertAllowedOrigin(requestHeaders, config.allowedOrigin);
        const presented = extractAccessToken(token, requestHeaders);
        const { identity, pageAccess } = await authorize(presented, documentName);
        connectionConfig.readOnly = !pageAccess.canWrite;

        return { expiresAt: identity.expiresAt, pageAccess, sessionId: identity.sessionId };
      } catch (error) {
        logger.warn('collaboration authentication rejected', {
          documentName,
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        throw error;
      }
    },
    /**
     * Соединение открыто — ставим срок, по которому у клиента будет запрошен
     * действующий токен. Без этого решение о доступе жило бы до переподключения.
     */
    async connected({ connection, context, documentName }) {
      schedule.arm(connection, context.expiresAt, () => {
        logger.warn('collaboration connection closed without token refresh', { documentName });
      });
    },
    /**
     * Продление по живому сокету: та же проверка, что при подключении. Понижение
     * роли переводит соединение в read-only, потеря доступа закрывает его.
     */
    async onTokenSync({ connection, connectionConfig, documentName, token }) {
      try {
        const { identity, pageAccess } = await authorize(token, documentName);

        connection.readOnly = !pageAccess.canWrite;
        connectionConfig.readOnly = !pageAccess.canWrite;
        schedule.arm(connection, identity.expiresAt, () => {
          logger.warn('collaboration connection closed without token refresh', { documentName });
        });

        return { expiresAt: identity.expiresAt, pageAccess, sessionId: identity.sessionId };
      } catch (error) {
        // Недоступность API — не отказ: соединение доживает грейс-окно и там
        // получает следующую попытку.
        const deferred =
          !(error instanceof ApiDeniedError) &&
          schedule.tolerate(connection, () => {
            logger.warn('collaboration connection closed without token refresh', { documentName });
          });

        if (deferred) {
          logger.warn('collaboration reauthorization deferred', {
            documentName,
            reason: error instanceof Error ? error.constructor.name : 'UnknownError',
          });
          return;
        }

        logger.warn('collaboration reauthorization rejected', {
          documentName,
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        throw error;
      }
    },
    async onDisconnect({ socketId }) {
      schedule.forget(socketId);
    },
    async onLoadDocument({ documentName }) {
      try {
        return await persistence.load(documentName);
      } catch (error) {
        logger.warn('collaboration document load failed', {
          documentName,
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        throw error;
      }
    },
    async onStoreDocument({ document, documentName, instance }) {
      try {
        await persistence.store(documentName, document);
      } catch (error) {
        if (
          error instanceof DocumentStoreSkippedError ||
          error instanceof DocumentSizeLimitExceededError
        ) {
          instance.closeConnections(documentName);
          logger.warn('collaboration document room closed after store rejection', {
            documentName,
            reason: error.constructor.name,
          });
          return;
        }

        logger.error('collaboration document store failed', {
          documentName,
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        throw error;
      }
    },
    async onListen({ port }) {
      logger.info('collaboration server started', { port });
    },
    async onDestroy() {
      schedule.stop();
      logger.info('collaboration server stopped');
    },
  });
}

export function registerShutdown(runtime: CollaborationRuntime, logger: CollaborationLogger): void {
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      logger.info('collaboration shutdown started', { signal });
      await runtime.destroy();
      logger.info('collaboration shutdown complete', { signal });
    })();

    void shutdownPromise
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error('collaboration shutdown failed', {
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
          signal,
        });
        process.exit(1);
      });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export type { Connection };
