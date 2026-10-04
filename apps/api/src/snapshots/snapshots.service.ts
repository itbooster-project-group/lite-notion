import { Inject, Injectable } from '@nestjs/common';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError } from '../pages/errors';
import { SnapshotsRepository } from './snapshots.repository';
import type { SnapshotMetadata } from './types/snapshot-metadata';

@Injectable()
export class SnapshotsService {
  constructor(
    @Inject(SnapshotsRepository) private readonly snapshots: SnapshotsRepository,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

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
