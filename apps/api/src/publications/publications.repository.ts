import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';
import type { PagePublicationStatus } from '../generated/prisma/enums';

export interface PublicationRecord {
  id: string;
  pageId: string;
  snapshotId: string | null;
  slug: string;
  status: PagePublicationStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface PublicationMetadataUpdate {
  slug?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface PublishPublicationInput {
  pageId: string;
  snapshotId: string;
  slug: string;
  publishedAt: Date;
}

export interface ClaimedRevalidation {
  id: string;
  paths: string[];
  attempts: number;
  leaseToken: string;
}

@Injectable()
export abstract class PublicationsRepository {
  abstract bind(scope: TransactionScope): PublicationsRepository;
  abstract findByPage(pageId: string): Promise<PublicationRecord | null>;
  abstract createDraft(
    pageId: string,
    metadata: PublicationMetadataUpdate & { slug: string },
  ): Promise<PublicationRecord>;
  abstract updateMetadata(
    pageId: string,
    metadata: PublicationMetadataUpdate,
  ): Promise<PublicationRecord | null>;
  abstract publish(input: PublishPublicationInput): Promise<PublicationRecord>;
  abstract unpublish(pageId: string): Promise<PublicationRecord | null>;
  abstract findPublishedPageSlugs(pageIds: readonly string[]): Promise<string[]>;
  abstract markPublishedUnpublished(pageIds: readonly string[]): Promise<void>;
  abstract createRevalidation(paths: readonly string[]): Promise<void>;
  abstract claimRevalidation(
    token: string,
    leaseDurationMs: number,
  ): Promise<ClaimedRevalidation | null>;
  abstract acknowledgeRevalidation(id: string, token: string, deliveredAt: Date): Promise<boolean>;
  abstract rescheduleRevalidation(
    id: string,
    token: string,
    nextAttemptAt: Date,
    errorCode: string,
  ): Promise<boolean>;
}

const PUBLICATION_SELECT = {
  id: true,
  pageId: true,
  snapshotId: true,
  slug: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaPublicationsRepository extends PublicationsRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPublicationsRepository {
    return new PrismaPublicationsRepository(databaseClientOf(scope));
  }

  findByPage(pageId: string): Promise<PublicationRecord | null> {
    return this.client.pagePublication.findUnique({
      select: PUBLICATION_SELECT,
      where: { pageId },
    });
  }

  createDraft(
    pageId: string,
    metadata: PublicationMetadataUpdate & { slug: string },
  ): Promise<PublicationRecord> {
    return this.client.pagePublication.create({
      data: { ...metadata, pageId },
      select: PUBLICATION_SELECT,
    });
  }

  updateMetadata(
    pageId: string,
    metadata: PublicationMetadataUpdate,
  ): Promise<PublicationRecord | null> {
    return this.client.pagePublication
      .update({
        data: metadata,
        select: PUBLICATION_SELECT,
        where: { pageId },
      })
      .catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2025'
        ) {
          return null;
        }
        throw error;
      });
  }

  publish(input: PublishPublicationInput): Promise<PublicationRecord> {
    return this.client.pagePublication.upsert({
      create: {
        pageId: input.pageId,
        publishedAt: input.publishedAt,
        slug: input.slug,
        snapshotId: input.snapshotId,
        status: 'published',
      },
      select: PUBLICATION_SELECT,
      update: {
        publishedAt: input.publishedAt,
        slug: input.slug,
        snapshotId: input.snapshotId,
        status: 'published',
      },
      where: { pageId: input.pageId },
    });
  }

  unpublish(pageId: string): Promise<PublicationRecord | null> {
    return this.client.pagePublication
      .update({
        data: { status: 'unpublished' },
        select: PUBLICATION_SELECT,
        where: { pageId },
      })
      .catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2025'
        ) {
          return null;
        }
        throw error;
      });
  }

  async findPublishedPageSlugs(pageIds: readonly string[]): Promise<string[]> {
    if (pageIds.length === 0) return [];
    const rows = await this.client.pagePublication.findMany({
      select: { slug: true },
      where: { pageId: { in: [...pageIds] }, status: 'published' },
    });
    return rows.map(({ slug }) => slug);
  }

  async markPublishedUnpublished(pageIds: readonly string[]): Promise<void> {
    if (pageIds.length === 0) return;
    await this.client.pagePublication.updateMany({
      data: { status: 'unpublished' },
      where: { pageId: { in: [...pageIds] }, status: 'published' },
    });
  }

  async createRevalidation(paths: readonly string[]): Promise<void> {
    const uniquePaths = [...new Set(paths)].sort();
    if (uniquePaths.length === 0) return;
    await this.client.publicationRevalidation.create({ data: { paths: uniquePaths } });
  }

  async claimRevalidation(
    token: string,
    leaseDurationMs: number,
  ): Promise<ClaimedRevalidation | null> {
    const rows = await this.client.$queryRaw<ClaimedRevalidation[]>`
      WITH candidate AS (
        SELECT "id", clock_timestamp() AS "claimedAt"
        FROM "PublicationRevalidation"
        WHERE "deliveredAt" IS NULL
          AND "nextAttemptAt" <= clock_timestamp()
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= clock_timestamp())
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "PublicationRevalidation" AS event
      SET "leaseToken" = ${token}::uuid,
          "leaseUntil" = candidate."claimedAt" + (${leaseDurationMs} * INTERVAL '1 millisecond'),
          "attempts" = event."attempts" + 1
      FROM candidate
      WHERE event."id" = candidate."id"
      RETURNING event."id", event."paths", event."attempts", event."leaseToken"
    `;
    const row = rows[0];
    if (!row) return null;
    return { ...row, leaseToken: row.leaseToken as string };
  }

  async acknowledgeRevalidation(id: string, token: string, deliveredAt: Date): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ id: string }[]>`
      UPDATE "PublicationRevalidation"
      SET "deliveredAt" = ${deliveredAt},
          "lastErrorCode" = NULL,
          "leaseToken" = NULL,
          "leaseUntil" = NULL
      WHERE "deliveredAt" IS NULL
        AND "id" = ${id}::uuid
        AND "leaseToken" = ${token}::uuid
        AND "leaseUntil" > clock_timestamp()
      RETURNING "id"
    `;
    return rows.length > 0;
  }

  async rescheduleRevalidation(
    id: string,
    token: string,
    nextAttemptAt: Date,
    errorCode: string,
  ): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ id: string }[]>`
      UPDATE "PublicationRevalidation"
      SET "lastErrorCode" = ${errorCode},
          "leaseToken" = NULL,
          "leaseUntil" = NULL,
          "nextAttemptAt" = ${nextAttemptAt}
      WHERE "deliveredAt" IS NULL
        AND "id" = ${id}::uuid
        AND "leaseToken" = ${token}::uuid
        AND "leaseUntil" > clock_timestamp()
      RETURNING "id"
    `;
    return rows.length > 0;
  }
}
