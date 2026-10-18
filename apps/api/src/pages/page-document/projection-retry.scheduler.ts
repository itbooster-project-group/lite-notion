import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import type { PageDocumentRecord } from './page-document.repository';
import { PAGE_ASSET_PROJECTION_MAX_ATTEMPTS } from './projection-retry.constants';
import { ProjectPageAssetsUseCase } from './use-cases/project-page-assets.use-case';

const RETRY_BATCH_SIZE = 25;

@Injectable()
export class ProjectionRetryScheduler {
  private readonly logger = new Logger(ProjectionRetryScheduler.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectPageAssetsUseCase) private readonly projection: ProjectPageAssetsUseCase,
  ) {}

  @Interval(15_000)
  async retryStaleProjections(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const records = await this.prisma.$queryRaw<PageDocumentRecord[]>`
        SELECT document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
        FROM "PageDocument" AS document
        INNER JOIN "PageAssetProjection" AS projection ON projection."pageId" = document."pageId"
        WHERE projection."sourceStorageRevision" IS DISTINCT FROM document."storageRevision"
          AND projection."attemptCount" < ${PAGE_ASSET_PROJECTION_MAX_ATTEMPTS}
          AND (
            projection."attemptedStorageRevision" IS NULL
            OR projection."attemptedStorageRevision" <> document."storageRevision"
            OR (
              projection."retryAfter" <= NOW()
              AND projection."lastErrorCode" NOT IN ('permanent_validation', 'retry_exhausted')
            )
          )
        ORDER BY projection."updatedAt" ASC
        LIMIT ${RETRY_BATCH_SIZE}
      `;
      for (const record of records) await this.projection.execute(record);
    } catch (error) {
      this.logger.warn(
        `Stale asset projection scan failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
