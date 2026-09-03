import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { API_GLOBAL_PREFIX, JSON_BODY_LIMIT } from './common/constants';
import type { ApplicationConfig } from './config/application-config';
import { NodeEnvironment } from './config/environment';

type ApplicationEnvironment = Pick<ApplicationConfig, 'corsOrigin' | 'nodeEnvironment'>;
type CorsCallback = (error: Error | null, allow?: boolean) => void;

/**
 * `configureApplication` объявлена над `INestApplication`, чтобы не привязывать
 * bootstrap к транспорту. Настройка парсера тела при этом специфична для Express,
 * поэтому проверяется наличие метода, а не тип приложения.
 */
function isExpressApplication(app: INestApplication): app is NestExpressApplication {
  return typeof (app as Partial<NestExpressApplication>).useBodyParser === 'function';
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Lite Notion API')
    .setDescription('HTTP API for Lite Notion')
    .setVersion('1.0')
    .addBearerAuth({
      bearerFormat: 'JWT',
      description: 'Access token issued by /auth/login or /auth/register',
      scheme: 'bearer',
      type: 'http',
    })
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}

export function configureApplication(
  app: INestApplication,
  environment: ApplicationEnvironment,
): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  // Предел Express по умолчанию (100 KB) меньше Yjs state страницы. Запас над
  // DOCUMENT_MAX_BYTES нужен, чтобы отказ по размеру давал ValidationPipe, а не
  // сырой 413 от парсера. useBodyParser — потому что express не прямая зависимость.
  if (isExpressApplication(app)) {
    app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  }

  app.use(cookieParser());
  // credentials нужны, иначе браузер не отправит refresh cookie на /auth/refresh и
  // /auth/logout. Origin проверяется точным совпадением: wildcard вместе с
  // credentials — единственное опасное сочетание.
  app.enableCors({
    credentials: true,
    origin: (requestOrigin: string | undefined, callback: CorsCallback) => {
      callback(null, requestOrigin === undefined || requestOrigin === environment.corsOrigin);
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks();

  if (environment.nodeEnvironment !== NodeEnvironment.Production) {
    SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app), {
      jsonDocumentUrl: '/api/openapi.json',
      raw: ['json'],
      useGlobalPrefix: false,
    });
  }
}
