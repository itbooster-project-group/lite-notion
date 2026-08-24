import { registerAs } from '@nestjs/config';

import { type NodeEnvironment, validateEnvironment } from './environment';

export interface ApplicationConfig {
  accessTokenTtlS: number;
  bcryptRounds: number;
  corsOrigin: string;
  databaseConnectionTimeoutMs: number;
  databaseUrl: string;
  jwtSecret: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
  refreshTokenTtlS: number;
}

export function createApplicationConfig(environment: Record<string, unknown>): ApplicationConfig {
  const validatedEnvironment = validateEnvironment(environment);

  return {
    accessTokenTtlS: validatedEnvironment.ACCESS_TOKEN_TTL_S,
    bcryptRounds: validatedEnvironment.BCRYPT_ROUNDS,
    corsOrigin: validatedEnvironment.CORS_ORIGIN,
    databaseConnectionTimeoutMs: validatedEnvironment.DATABASE_CONNECTION_TIMEOUT_MS,
    databaseUrl: validatedEnvironment.DATABASE_URL,
    jwtSecret: validatedEnvironment.JWT_SECRET,
    nodeEnvironment: validatedEnvironment.NODE_ENV,
    port: validatedEnvironment.PORT,
    refreshTokenTtlS: validatedEnvironment.REFRESH_TOKEN_TTL_S,
  };
}

export const applicationConfig = registerAs('application', () =>
  createApplicationConfig(process.env),
);
