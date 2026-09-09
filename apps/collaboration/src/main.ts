import { createPrismaClient } from '@lite-notion/database';

import { createCollaborationConfig } from './config/environment';
import { consoleLogger } from './logging/logger';
import { createCollaborationServer, registerShutdown } from './server/collaboration-server';

async function main(): Promise<void> {
  const config = createCollaborationConfig(process.env);
  const prisma = createPrismaClient(config);
  const server = createCollaborationServer(config, prisma, consoleLogger);

  registerShutdown(server, prisma, consoleLogger);

  await server.listen();
}

void main().catch((error: unknown) => {
  consoleLogger.error('collaboration startup failed', {
    reason: error instanceof Error ? error.message : 'UnknownError',
  });
  process.exit(1);
});
