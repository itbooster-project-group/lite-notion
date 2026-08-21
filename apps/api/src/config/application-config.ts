import { registerAs } from '@nestjs/config';

import { type NodeEnvironment, validateEnvironment } from './environment';

export interface ApplicationConfig {
  corsOrigin: string;
  databaseConnectionTimeoutMs: number;
  databaseUrl: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
}

export function createApplicationConfig(environment: Record<string, unknown>): ApplicationConfig {
  const validatedEnvironment = validateEnvironment(environment);

  return {
    corsOrigin: validatedEnvironment.CORS_ORIGIN,
    databaseConnectionTimeoutMs: validatedEnvironment.DATABASE_CONNECTION_TIMEOUT_MS,
    databaseUrl: validatedEnvironment.DATABASE_URL,
    nodeEnvironment: validatedEnvironment.NODE_ENV,
    port: validatedEnvironment.PORT,
  };
}

export const applicationConfig = registerAs('application', () =>
  createApplicationConfig(process.env),
);
