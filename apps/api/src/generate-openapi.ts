import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication, createOpenApiDocument } from './application';
import { type ApplicationConfig, applicationConfig } from './config/application-config';

async function generateOpenApiSnapshot(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });

  try {
    const config = app.get<ApplicationConfig>(applicationConfig.KEY);
    configureApplication(app, config);

    const document = createOpenApiDocument(app);
    const output = `${JSON.stringify(document, null, 2)}\n`;

    await writeFile(resolve(process.cwd(), 'openapi.json'), output, 'utf8');
  } finally {
    await app.close();
  }
}

void generateOpenApiSnapshot().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Failed to generate OpenAPI snapshot');
  process.exitCode = 1;
});
