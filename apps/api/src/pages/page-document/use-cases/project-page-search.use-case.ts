import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../database/transaction';
import { projectDocument } from '../../../document-projection/document-projection';
import { DocumentProjectionError } from '../../../document-projection/document-projection.errors';
import type { PageDocumentRecord } from '../page-document.repository';
import { PageDocumentRepository } from '../page-document.repository';
import { PageSearchProjectionRepository } from '../page-search-projection.repository';
import { extractSearchableText } from '../search-text-extractor';

export const PAGE_SEARCH_PROJECTION_MAX_ATTEMPTS = 5;

export type SearchProjectionOutcome =
  | 'projected'
  | 'skipped'
  | 'stale'
  | 'failed'
  | 'retry-state-failed';

@Injectable()
export class ProjectPageSearchUseCase {
  private readonly logger = new Logger(ProjectPageSearchUseCase.name);

  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository,
    @Inject(PageSearchProjectionRepository)
    private readonly projections: PageSearchProjectionRepository,
  ) {}

  async execute(record: PageDocumentRecord, force = false): Promise<SearchProjectionOutcome> {
    try {
      const current = await this.projections.findFailureState(record.pageId);
      if (!force && current?.sourceStorageRevision === record.storageRevision) return 'skipped';

      const documentProjection = projectDocument({
        yjsState: record.yjsState,
        tiptapSchemaVersion: record.tiptapSchemaVersion,
      });
      const plainText = extractSearchableText(documentProjection.contentJson);

      const written = await this.transactions.run(async (scope) => {
        const currentRevision = await this.documents
          .bind(scope)
          .lockForSearchProjection(record.pageId);
        if (currentRevision !== record.storageRevision) return false;

        return this.projections
          .bind(scope)
          .writeSuccess(record.pageId, plainText, record.storageRevision);
      });

      return written ? 'projected' : 'stale';
    } catch (error) {
      this.logger.warn(
        `Search projection failed for page ${record.pageId}: ${safeErrorName(error)}`,
      );
      return this.recordFailure(record, error);
    }
  }

  private async recordFailure(
    record: PageDocumentRecord,
    error: unknown,
  ): Promise<SearchProjectionOutcome> {
    try {
      const result = await this.transactions.run(async (scope) => {
        const currentRevision = await this.documents
          .bind(scope)
          .lockForSearchProjection(record.pageId);
        if (currentRevision !== record.storageRevision) return 'stale' as const;

        const projections = this.projections.bind(scope);
        const current = await projections.findFailureState(record.pageId);
        if (
          current?.sourceStorageRevision !== null &&
          current?.sourceStorageRevision !== undefined &&
          current.sourceStorageRevision >= record.storageRevision
        ) {
          return 'preserved' as const;
        }

        const previousAttempts =
          current?.attemptedStorageRevision === record.storageRevision ? current.attemptCount : 0;
        const attemptCount = previousAttempts + 1;
        const permanent = error instanceof DocumentProjectionError;
        const exhausted = !permanent && attemptCount >= PAGE_SEARCH_PROJECTION_MAX_ATTEMPTS;
        const lastErrorCode = permanent
          ? 'permanent_validation'
          : exhausted
            ? 'retry_exhausted'
            : 'transient_projection';

        await projections.writeFailure({
          attemptCount,
          lastErrorCode,
          pageId: record.pageId,
          retryAfter:
            permanent || exhausted ? null : new Date(Date.now() + retryDelay(previousAttempts)),
          storageRevision: record.storageRevision,
        });

        return 'recorded' as const;
      });

      if (result === 'stale') return 'stale';
      return 'failed';
    } catch (stateError) {
      this.logger.warn(
        `Search projection retry state could not be stored for page ${record.pageId}: ${safeErrorName(stateError)}`,
      );
      return 'retry-state-failed';
    }
  }
}

function retryDelay(attemptCount: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.min(attemptCount, 8));
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}
