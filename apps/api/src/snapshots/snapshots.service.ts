import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../database/transaction';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError } from '../pages/errors';
import { SnapshotsRepository } from './snapshots.repository';
import type {
  CreateInternalSnapshotInput,
  CreateManualSnapshotInput,
} from './types/snapshot-creation';
import type { SnapshotMetadata } from './types/snapshot-metadata';
import { CreateSnapshotUseCase } from './use-cases/create-snapshot.use-case';

@Injectable()
export class SnapshotsService {
  constructor(
    @Inject(CreateSnapshotUseCase) private readonly createSnapshot: CreateSnapshotUseCase,
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

  createManual(
    input: CreateManualSnapshotInput,
    scope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    return this.createSnapshot.createManual(input, scope);
  }

  createInternal(
    input: CreateInternalSnapshotInput,
    scope?: TransactionScope,
  ): Promise<SnapshotMetadata> {
    return this.createSnapshot.createInternal(input, scope);
  }

  async listMetadata(pageId: string, actorId: string): Promise<SnapshotMetadata[]> {
    await this.permissions.requireRole(actorId, pageId, PageRole.VIEWER);

    return this.snapshots.listMetadataByPage(pageId);
  }

  async getMetadata(
    pageId: string,
    snapshotId: string,
    actorId: string,
  ): Promise<SnapshotMetadata> {
    await this.permissions.requireRole(actorId, pageId, PageRole.VIEWER);
    const snapshot = await this.snapshots.findMetadataByPageAndId(pageId, snapshotId);

    if (snapshot === null) {
      throw new PageNotFoundError();
    }

    return snapshot;
  }
}
