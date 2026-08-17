import { registerAs } from "@nestjs/config";

import { type NodeEnvironment, validateEnvironment } from "./environment";

export interface ApplicationConfig {
  corsOrigin: string;
  nodeEnvironment: NodeEnvironment;
  port: number;
}

export function createApplicationConfig(environment: Record<string, unknown>): ApplicationConfig {
  const validatedEnvironment = validateEnvironment(environment);

  return {
    corsOrigin: validatedEnvironment.CORS_ORIGIN,
    nodeEnvironment: validatedEnvironment.NODE_ENV,
    port: validatedEnvironment.PORT,
  };
}

export const applicationConfig = registerAs("application", () =>
  createApplicationConfig(process.env),
);
