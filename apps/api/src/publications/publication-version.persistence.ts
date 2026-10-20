import { Inject, Injectable } from '@nestjs/common';
import { databaseClientOf, type TransactionScope } from '../database/transaction';
import type { CapturedDocumentState } from '../document-capture/document-capture.client';
import type { DocumentProjection } from '../document-projection/document-projection';
import { SnapshotReason } from '../generated/prisma/enums';
import { CreateSnapshotInternalUseCase } from '../snapshots/use-cases/create-snapshot-internal.use-case';
import {
  PublicationsRepository,
  type PublicationsRepository as PublicationsRepositoryType,
} from './publications.repository';

export interface PersistPublicationSnapshotInput {
  actorId: string;
  captured: CapturedDocumentState;
  pageId: string;
}

export interface PersistPublicationVersionInput {
  coverAssetId: string | null;
  pageId: string;
  pageTitle: string;
  projection: DocumentProjection;
  revalidationPaths: readonly string[];
  snapshotId: string;
  slug: string;
}

/** Persists snapshot-derived publication rows inside a caller-owned transaction. */
@Injectable()
export class PublicationVersionPersistence {
  constructor(
    @Inject(CreateSnapshotInternalUseCase)
    private readonly snapshots: CreateSnapshotInternalUseCase,
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepositoryType,
  ) {}

  createSnapshot(scope: TransactionScope, input: PersistPublicationSnapshotInput) {
    return this.snapshots.execute(
      {
        ...input.captured,
        createdById: input.actorId,
        pageId: input.pageId,
        reason: SnapshotReason.publication,
      },
      scope,
    );
  }

  async persist(scope: TransactionScope, input: PersistPublicationVersionInput) {
    const db = databaseClientOf(scope);
    await db.documentRendering.create({
      data: {
        contentJson: input.projection.contentJson,
        coverAssetId: input.coverAssetId,
        pageTitle: input.pageTitle,
        snapshotId: input.snapshotId,
        tiptapSchemaVersion: input.projection.schemaVersion,
      },
    });
    const assetRefs = input.projection.mediaReferences.flatMap((reference) =>
      reference.type === 'asset'
        ? [{ assetId: reference.assetId, nodeId: reference.nodeId, snapshotId: input.snapshotId }]
        : [],
    );
    if (assetRefs.length > 0) await db.snapshotAsset.createMany({ data: assetRefs });

    const publication = await this.publications.bind(scope).publish({
      pageId: input.pageId,
      publishedAt: new Date(),
      slug: input.slug,
      snapshotId: input.snapshotId,
    });
    await this.publications.bind(scope).createRevalidation(input.revalidationPaths);
    return publication;
  }
}
