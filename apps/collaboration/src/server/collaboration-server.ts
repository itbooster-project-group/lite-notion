import { Server } from '@hocuspocus/server';
import type { PrismaClient } from '@lite-notion/database';

import { authenticateAccessToken } from '../auth/access-token';
import { assertAllowedOrigin } from '../auth/origin';
import type { CollaborationConfig } from '../config/environment';
import { parsePageDocumentName } from '../documents/document-name';
import { type PageAccess, PageAccessService } from '../documents/page-access';
import {
  DocumentSizeLimitExceededError,
  DocumentStoreSkippedError,
  PageDocumentPersistence,
} from '../documents/persistence';
import type { CollaborationLogger } from '../logging/logger';

export interface CollaborationContext {
  pageAccess: PageAccess;
  sessionId: string;
}

export interface CollaborationRuntime {
  destroy(): Promise<void>;
  listen(): Promise<unknown>;
}

export function createCollaborationServer(
  config: CollaborationConfig,
  prisma: PrismaClient,
  logger: CollaborationLogger,
  options: { address?: string; debounce?: number; maxDebounce?: number } = {},
): Server<CollaborationContext> {
  const access = new PageAccessService(prisma);
  const persistence = new PageDocumentPersistence(prisma);

  return new Server<CollaborationContext>({
    name: 'lite-notion-collaboration',
    ...(options.address ? { address: options.address } : {}),
    ...(typeof options.debounce === 'number' ? { debounce: options.debounce } : {}),
    ...(typeof options.maxDebounce === 'number' ? { maxDebounce: options.maxDebounce } : {}),
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
        const user = authenticateAccessToken(token, requestHeaders, config.jwtSecret);
        const { pageId } = parsePageDocumentName(documentName);
        const pageAccess = await access.authorize(user.userId, pageId);
        connectionConfig.readOnly = !pageAccess.canWrite;

        return {
          pageAccess,
          sessionId: user.sessionId,
        };
      } catch (error) {
        logger.warn('collaboration authentication rejected', {
          documentName,
          reason: error instanceof Error ? error.constructor.name : 'UnknownError',
        });
        throw error;
      }
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
      logger.info('collaboration server stopped');
    },
  });
}

export function registerShutdown(
  runtime: CollaborationRuntime,
  prisma: Pick<PrismaClient, '$disconnect'>,
  logger: CollaborationLogger,
): void {
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: NodeJS.Signals) => {
    shutdownPromise ??= (async () => {
      logger.info('collaboration shutdown started', { signal });
      await runtime.destroy();
      await prisma.$disconnect();
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
