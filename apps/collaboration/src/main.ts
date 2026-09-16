import { InternalApiClient } from './api/internal-api-client.js';
import { createCollaborationConfig } from './config/environment.js';
import { consoleLogger } from './logging/logger.js';
import { createCollaborationServer, registerShutdown } from './server/collaboration-server.js';

async function main(): Promise<void> {
  const config = createCollaborationConfig(process.env);
  const api = new InternalApiClient({
    baseUrl: config.apiBaseUrl,
    serviceToken: config.internalServiceToken,
    timeoutMs: config.apiTimeoutMs,
  });
  const server = createCollaborationServer(config, api, consoleLogger);

  registerShutdown(server, consoleLogger);

  await server.listen();
}

void main().catch((error: unknown) => {
  consoleLogger.error('collaboration startup failed', {
    reason: error instanceof Error ? error.message : 'UnknownError',
  });
  process.exit(1);
});
