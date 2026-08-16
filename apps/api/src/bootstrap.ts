import { type INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApplication } from "./application";
import type { EnvironmentConfig } from "./config/environment";

export async function startApplication(app: INestApplication): Promise<void> {
  const config = app.get<ConfigService<EnvironmentConfig, true>>(ConfigService);

  configureApplication(app, {
    CORS_ORIGIN: config.getOrThrow("CORS_ORIGIN", { infer: true }),
    NODE_ENV: config.getOrThrow("NODE_ENV", { infer: true }),
  });

  await app.listen(config.getOrThrow("PORT", { infer: true }));
}

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });

  await startApplication(app);
}

export function handleBootstrapError(error: unknown): void {
  const logger = new Logger("Bootstrap");
  const message =
    error instanceof Error && error.message.startsWith("Environment validation failed:")
      ? error.message
      : "Failed to start API";

  logger.error(message);
  process.exitCode = 1;
}
