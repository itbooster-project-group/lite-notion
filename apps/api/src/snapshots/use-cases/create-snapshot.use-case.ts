import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner, type TransactionScope } from '../../database/transaction';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { type InsertSnapshotInput, SnapshotsRepository } from '../snapshots.repository';
import type {
  CreateInternalSnapshotInput,
  CreateManualSnapshotInput,
} from '../types/snapshot-creation';
import type { SnapshotMetadata } from '../types/snapshot-metadata';

@Injectable()
export class CreateSnapshotUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
  ) {}

  createManual(
    input: CreateManualSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    return this.inScope(externalScope, async (scope) => {
      const role = await this.permissions.bind(scope).resolveRole(input.createdById, input.pageId);
      assertRole(role, PageRole.EDITOR);

      return this.create(input, SnapshotReason.manual, input.createdById, scope);
    });
  }

  createInternal(
    input: CreateInternalSnapshotInput,
    externalScope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    return this.inScope(externalScope, (scope) =>
      this.create(input, input.reason, input.createdById, scope),
    );
  }

  private inScope<T>(
    externalScope: TransactionScope | undefined,
    operation: (scope: TransactionScope) => Promise<T>,
  ): Promise<T> {
    return externalScope === undefined
      ? this.transactions.run(operation)
      : operation(externalScope);
  }

  private async create(
    input: CreateManualSnapshotInput | CreateInternalSnapshotInput,
    reason: InsertSnapshotInput['reason'],
    createdById: string | null,
    scope: TransactionScope,
  ): Promise<SnapshotMetadata> {
    const pages = this.pages.bind(scope);

    if (!(await pages.lockLivePageForUpdate(input.pageId))) {
      throw new PageNotFoundError();
    }

    const snapshots = this.snapshots.bind(scope);
    const latestRevision = await snapshots.findLatestRevision(input.pageId);
    const revision = (latestRevision ?? 0n) + 1n;

    return snapshots.insert({
      createdById,
      pageId: input.pageId,
      reason,
      revision,
      sourceStorageRevision: input.storageRevision,
      tiptapSchemaVersion: input.tiptapSchemaVersion,
      yjsState: input.yjsState,
    });
  }
}
