import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  controllers: [HealthController],
  imports: [DatabaseModule],
  providers: [HealthService],
})
export class HealthModule {}
