import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { type ApplicationConfig, applicationConfig } from "../config/application-config";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
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
}
