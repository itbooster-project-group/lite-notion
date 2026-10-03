import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner, type TransactionScope } from '../../database/transaction';
import { type SnapshotReason } from '../../generated/prisma/enums';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { type InsertSnapshotInput, SnapshotsRepository } from '../snapshots.repository';
import type { CapturedDocumentState } from '../types/captured-document-state';
import type { SnapshotMetadata } from '../types/snapshot-metadata';

export interface SnapshotCreationInput extends CapturedDocumentState {
  pageId: string;
  createdById: string | null;
}

@Injectable()
export class SnapshotCreationWorkflow {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
  ) {}

  create(
    input: SnapshotCreationInput,
    reason: SnapshotReason,
    externalScope?: TransactionScope,
    authorize?: (scope: TransactionScope) => Promise<void>,
  ): Promise<SnapshotMetadata> {
    const operation = async (scope: TransactionScope): Promise<SnapshotMetadata> => {
      await authorize?.(scope);

      const pages = this.pages.bind(scope);
      if (!(await pages.lockLivePageForUpdate(input.pageId))) {
        throw new PageNotFoundError();
      }

      const snapshots = this.snapshots.bind(scope);
      const latestRevision = await snapshots.findLatestRevision(input.pageId);
      const revision = (latestRevision ?? 0n) + 1n;

      const insert: InsertSnapshotInput = {
        createdById: input.createdById,
        pageId: input.pageId,
        reason,
        revision,
        sourceStorageRevision: input.storageRevision,
        tiptapSchemaVersion: input.tiptapSchemaVersion,
        yjsState: input.yjsState,
      };

      return snapshots.insert(insert);
    };

    return externalScope === undefined
      ? this.transactions.run(operation)
      : operation(externalScope);
  }
}
