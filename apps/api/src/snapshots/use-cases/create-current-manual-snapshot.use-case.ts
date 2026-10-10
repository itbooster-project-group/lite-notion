import { Inject, Injectable } from '@nestjs/common';

import { DocumentCaptureClient } from '../../document-capture/document-capture.client';
import { PageRole } from '../../page-permissions/constants';
import { PagePermissionsService } from '../../page-permissions/page-permissions.service';
import type { SnapshotMetadata } from '../types/snapshot-metadata';
import { CreateSnapshotManualUseCase } from './create-snapshot-manual.use-case';

@Injectable()
export class CreateCurrentManualSnapshotUseCase {
  constructor(
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(DocumentCaptureClient) private readonly capture: DocumentCaptureClient,
    @Inject(CreateSnapshotManualUseCase)
    private readonly createSnapshotManual: CreateSnapshotManualUseCase,
  ) {}

  async execute(pageId: string, actorId: string): Promise<SnapshotMetadata> {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    const capturedState = await this.capture.capture(pageId);

    return this.createSnapshotManual.execute({ ...capturedState, pageId, createdById: actorId });
  }
}
