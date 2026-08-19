import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import type { HealthResponseDto } from "./health.dto";

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthResponseDto> {
    try {
      await this.prisma.checkConnection();
    } catch {
      throw new ServiceUnavailableException("Database is unavailable");
    }

    return {
      status: "ok",
      database: "up",
    };
  }
}
