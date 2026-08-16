import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { type EnvironmentConfig, NodeEnvironment } from "./config/environment";

export const API_GLOBAL_PREFIX = "api/v1";

type ApplicationEnvironment = Pick<EnvironmentConfig, "CORS_ORIGIN" | "NODE_ENV">;
type CorsCallback = (error: Error | null, allow?: boolean) => void;

export function configureApplication(
  app: INestApplication,
  environment: ApplicationEnvironment,
): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.enableCors({
    credentials: false,
    origin: (requestOrigin: string | undefined, callback: CorsCallback) => {
      callback(null, requestOrigin === undefined || requestOrigin === environment.CORS_ORIGIN);
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

  if (environment.NODE_ENV !== NodeEnvironment.Production) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Lite Notion API")
      .setDescription("HTTP API for Lite Notion")
      .setVersion("1.0")
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup("api/docs", app, documentFactory, {
      jsonDocumentUrl: "/api/openapi.json",
      raw: ["json"],
      useGlobalPrefix: false,
    });
  }
}
