import { Inject, Injectable } from '@nestjs/common';

import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { DocumentCaptureClient } from './document-capture.client';
import { SnapshotsService } from './snapshots.service';
import type { SnapshotMetadata } from './types/snapshot-metadata';

@Injectable()
export class SnapshotApplicationService {
  constructor(
    @Inject(DocumentCaptureClient) private readonly captureClient: DocumentCaptureClient,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(SnapshotsService) private readonly snapshots: SnapshotsService,
  ) {}

  captureCurrentDocument(pageId: string) {
    return this.captureClient.capture(pageId);
  }

  async createManual(pageId: string, actorId: string): Promise<SnapshotMetadata> {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    const capturedState = await this.captureCurrentDocument(pageId);

    return this.snapshots.createManual({ ...capturedState, pageId, createdById: actorId });
  }
}
