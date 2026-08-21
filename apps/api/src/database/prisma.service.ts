import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(applicationConfig.KEY) config: ApplicationConfig) {
    const adapter = new PrismaPg({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    });

    super({ adapter });
  }

  async checkConnection(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.checkConnection();
      this.logger.log('Database connection established');
    } catch {
      this.logger.warn(
        'Database is unavailable at startup, the connection will be established on the first request. Check DATABASE_URL and GET /api/v1/health',
      );
    }
  }
}
