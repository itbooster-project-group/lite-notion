import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './auth/auth.module';
import { applicationConfig } from './config/application-config';
import { HealthModule } from './health/health.module';
import { HttpExceptionFilter } from './http-exception.filter';
import { PageDocumentModule } from './pages/page-document/page-document.module';
import { PagesModule } from './pages/pages.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      expandVariables: true,
      load: [applicationConfig],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    HealthModule,
    PagesModule,
    PageDocumentModule,
    ProjectsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
