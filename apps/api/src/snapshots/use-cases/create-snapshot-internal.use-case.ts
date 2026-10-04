import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner, type TransactionScope } from '../../database/transaction';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { type InsertSnapshotInput, SnapshotsRepository } from '../snapshots.repository';
import type { CreateInternalSnapshotInput } from '../types/snapshot-creation';
import type { SnapshotMetadata } from '../types/snapshot-metadata';

@Injectable()
export class CreateSnapshotInternalUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
  ) {}

  execute(
    input: CreateInternalSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    const capturedInput = { ...input, yjsState: input.yjsState.slice() };
    const operation = async (scope: TransactionScope): Promise<SnapshotMetadata> => {
      const pages = this.pages.bind(scope);
      if (!(await pages.lockLivePageForUpdate(capturedInput.pageId))) {
        throw new PageNotFoundError();
      }

      const snapshots = this.snapshots.bind(scope);
      const latestRevision = await snapshots.findLatestRevision(capturedInput.pageId);
      const insert: InsertSnapshotInput = {
        createdById: capturedInput.createdById,
        pageId: capturedInput.pageId,
        reason: capturedInput.reason,
        revision: (latestRevision ?? 0n) + 1n,
        sourceStorageRevision: capturedInput.storageRevision,
        tiptapSchemaVersion: capturedInput.tiptapSchemaVersion,
        yjsState: capturedInput.yjsState,
      };

      return snapshots.insert(insert);
    };

    return externalScope === undefined
      ? this.transactions.run(operation)
      : operation(externalScope);
  }
}
