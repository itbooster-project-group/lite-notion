import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import type { ApplicationConfig } from './config/application-config';
import { NodeEnvironment } from './config/environment';

export const API_GLOBAL_PREFIX = 'api/v1';

type ApplicationEnvironment = Pick<ApplicationConfig, 'corsOrigin' | 'nodeEnvironment'>;
type CorsCallback = (error: Error | null, allow?: boolean) => void;

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
