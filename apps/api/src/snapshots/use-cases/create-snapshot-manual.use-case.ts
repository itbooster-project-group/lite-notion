import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner, type TransactionScope } from '../../database/transaction';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { type InsertSnapshotInput, SnapshotsRepository } from '../snapshots.repository';
import type { CreateManualSnapshotInput } from '../types/snapshot-creation';
import type { SnapshotMetadata } from '../types/snapshot-metadata';

@Injectable()
export class CreateSnapshotManualUseCase {
  constructor(
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
  ) {}

  execute(
    input: CreateManualSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    const capturedInput = { ...input, yjsState: input.yjsState.slice() };
    const operation = async (scope: TransactionScope): Promise<SnapshotMetadata> => {
      const role = await this.permissions
        .bind(scope)
        .resolveRole(capturedInput.createdById, capturedInput.pageId);
      assertRole(role, PageRole.EDITOR);

      const pages = this.pages.bind(scope);
      if (!(await pages.lockLivePageForUpdate(capturedInput.pageId))) {
        throw new PageNotFoundError();
      }

      const snapshots = this.snapshots.bind(scope);
      const latestRevision = await snapshots.findLatestRevision(capturedInput.pageId);
      const insert: InsertSnapshotInput = {
        createdById: capturedInput.createdById,
        pageId: capturedInput.pageId,
        reason: SnapshotReason.manual,
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
