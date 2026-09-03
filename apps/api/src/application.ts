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
  // Значение Express по умолчанию (100 KB) меньше Yjs state страницы. Предел
  // взят с запасом над DOCUMENT_MAX_BYTES, чтобы отказ по размеру формировал
  // ValidationPipe единым форматом ошибки, а не парсер — сырым 413.
  // Через useBodyParser, а не app.use(express.json()): express не объявлен
  // прямой зависимостью apps/api, и заводить её ради одной опции незачем.
  if (isExpressApplication(app)) {
    app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  }

  app.use(cookieParser());
  // credentials разрешены, иначе браузер не отправит refresh cookie на /auth/refresh
  // и /auth/logout. Origin по-прежнему проверяется точным совпадением, поэтому
  // Access-Control-Allow-Origin никогда не станет wildcard — единственное
  // сочетание, которое при включённых credentials действительно опасно.
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
