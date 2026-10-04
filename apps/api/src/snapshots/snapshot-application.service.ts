import { Inject, Injectable } from '@nestjs/common';

import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { DocumentCaptureClient } from './document-capture.client';
import type { SnapshotMetadata } from './types/snapshot-metadata';
import { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';

@Injectable()
export class SnapshotApplicationService {
  constructor(
    @Inject(DocumentCaptureClient) private readonly captureClient: DocumentCaptureClient,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(CreateSnapshotManualUseCase)
    private readonly createSnapshotManual: CreateSnapshotManualUseCase,
  ) {}

  captureCurrentDocument(pageId: string) {
    return this.captureClient.capture(pageId);
  }

  async createManual(pageId: string, actorId: string): Promise<SnapshotMetadata> {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    const capturedState = await this.captureCurrentDocument(pageId);

    return this.createSnapshotManual.execute({ ...capturedState, pageId, createdById: actorId });
  }
}
