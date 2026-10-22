import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../../database/transaction';

export interface SearchProjectionFailureState {
  sourceStorageRevision: bigint | null;
  attemptedStorageRevision: bigint | null;
  attemptCount: number;
}

export interface SearchProjectionFailure {
  pageId: string;
  storageRevision: bigint;
  attemptCount: number;
  retryAfter: Date | null;
  lastErrorCode: string;
}

@Injectable()
export abstract class PageSearchProjectionRepository {
  abstract bind(scope: TransactionScope): PageSearchProjectionRepository;

  abstract writeSuccess(
    pageId: string,
    plainText: string,
    storageRevision: bigint,
  ): Promise<boolean>;

  abstract findFailureState(pageId: string): Promise<SearchProjectionFailureState | null>;

  abstract writeFailure(failure: SearchProjectionFailure): Promise<void>;
}

@Injectable()
export class PrismaPageSearchProjectionRepository extends PageSearchProjectionRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPageSearchProjectionRepository {
    return new PrismaPageSearchProjectionRepository(databaseClientOf(scope));
  }

  async writeSuccess(pageId: string, plainText: string, storageRevision: bigint): Promise<boolean> {
    const changed = await this.client.$executeRaw`
      INSERT INTO "PageSearchDocument" (
        "pageId", "plainText", "searchVector", "sourceStorageRevision",
        "attemptedStorageRevision", "attemptCount", "retryAfter", "lastErrorCode", "updatedAt"
      ) VALUES (
        ${pageId}::uuid, ${plainText}, to_tsvector('simple', ${plainText}), ${storageRevision},
        ${storageRevision}, 0, NULL, NULL, NOW()
      )
      ON CONFLICT ("pageId") DO UPDATE SET
        "plainText" = EXCLUDED."plainText",
        "searchVector" = EXCLUDED."searchVector",
        "sourceStorageRevision" = EXCLUDED."sourceStorageRevision",
        "attemptedStorageRevision" = EXCLUDED."attemptedStorageRevision",
        "attemptCount" = 0,
        "retryAfter" = NULL,
        "lastErrorCode" = NULL,
        "updatedAt" = NOW()
      WHERE "PageSearchDocument"."sourceStorageRevision" IS NULL
         OR "PageSearchDocument"."sourceStorageRevision" <= EXCLUDED."sourceStorageRevision"
    `;
    return changed > 0;
  }

  findFailureState(pageId: string): Promise<SearchProjectionFailureState | null> {
    return this.client.pageSearchDocument.findUnique({
      where: { pageId },
      select: { attemptCount: true, attemptedStorageRevision: true, sourceStorageRevision: true },
    });
  }

  async writeFailure(failure: SearchProjectionFailure): Promise<void> {
    await this.client.$executeRaw`
      INSERT INTO "PageSearchDocument" (
        "pageId", "plainText", "searchVector", "sourceStorageRevision",
        "attemptedStorageRevision", "attemptCount", "retryAfter", "lastErrorCode", "updatedAt"
      ) VALUES (
        ${failure.pageId}::uuid, '', ''::tsvector, NULL, ${failure.storageRevision},
        ${failure.attemptCount}, ${failure.retryAfter}, ${failure.lastErrorCode}, NOW()
      )
      ON CONFLICT ("pageId") DO UPDATE SET
        "attemptedStorageRevision" = EXCLUDED."attemptedStorageRevision",
        "attemptCount" = EXCLUDED."attemptCount",
        "retryAfter" = EXCLUDED."retryAfter",
        "lastErrorCode" = EXCLUDED."lastErrorCode",
        "updatedAt" = NOW()
      WHERE "PageSearchDocument"."sourceStorageRevision" IS NULL
         OR "PageSearchDocument"."sourceStorageRevision" < EXCLUDED."attemptedStorageRevision"
    `;
  }
}
