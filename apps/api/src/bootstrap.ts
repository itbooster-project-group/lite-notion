import { type INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApplication } from "./application";
import { type ApplicationConfig, applicationConfig } from "./config/application-config";

export async function startApplication(app: INestApplication): Promise<void> {
  const config = app.get<ApplicationConfig>(applicationConfig.KEY);

  configureApplication(app, config);

  await app.listen(config.port);
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
