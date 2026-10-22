import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import type { PageDocumentRecord } from './page-document.repository';
import {
  PAGE_SEARCH_PROJECTION_MAX_ATTEMPTS,
  ProjectPageSearchUseCase,
} from './use-cases/project-page-search.use-case';

const RETRY_BATCH_SIZE = 25;

@Injectable()
export class SearchProjectionRetryScheduler {
  private readonly logger = new Logger(SearchProjectionRetryScheduler.name);
  private running = false;
  private cursor: string | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProjectPageSearchUseCase) private readonly projection: ProjectPageSearchUseCase,
  ) {}

  @Interval(15_000)
  async retryStaleProjections(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const records = await this.prisma.$queryRaw<PageDocumentRecord[]>`
        SELECT document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
        FROM "PageDocument" AS document
        LEFT JOIN "PageSearchDocument" AS projection ON projection."pageId" = document."pageId"
        WHERE (
          projection."pageId" IS NULL
          OR projection."sourceStorageRevision" IS NULL
          OR projection."sourceStorageRevision" < document."storageRevision"
        )
          AND (
            projection."pageId" IS NULL
            OR projection."attemptedStorageRevision" IS DISTINCT FROM document."storageRevision"
            OR (
              COALESCE(projection."lastErrorCode", '') NOT IN ('permanent_validation', 'retry_exhausted')
              AND projection."attemptCount" < ${PAGE_SEARCH_PROJECTION_MAX_ATTEMPTS}
              AND (projection."retryAfter" IS NULL OR projection."retryAfter" <= NOW())
            )
          )
          AND (${this.cursor}::uuid IS NULL OR document."pageId" > ${this.cursor}::uuid)
        ORDER BY document."pageId" ASC
        LIMIT ${RETRY_BATCH_SIZE}
      `;

      if (records.length === 0) {
        this.cursor = null;
        return;
      }

      for (const record of records) {
        this.cursor = record.pageId;
        const outcome = await this.projection.execute(record);
        if (outcome === 'retry-state-failed') break;
      }
      if (records.length < RETRY_BATCH_SIZE) this.cursor = null;
    } catch (error) {
      this.logger.warn(
        `Search projection scan failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
