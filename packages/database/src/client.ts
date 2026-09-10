import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export interface DatabaseClientConfig {
  databaseConnectionTimeoutMs: number;
  databaseUrl: string;
}

export type PrismaClientOptions = ConstructorParameters<typeof PrismaClient>[0];

export function createPrismaClientOptions(config: DatabaseClientConfig): PrismaClientOptions {
  return {
    adapter: new PrismaPg({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    }),
  };
}

export function createPrismaClient(config: DatabaseClientConfig): PrismaClient {
  return new PrismaClient(createPrismaClientOptions(config));
}

export { PrismaClient };
