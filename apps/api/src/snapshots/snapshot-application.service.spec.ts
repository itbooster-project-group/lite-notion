import { describe, expect, it, vi } from 'vitest';

import { SnapshotReason } from '../generated/prisma/enums';
import { PageRole } from '../page-permissions/constants';
import { PageRoleInsufficientError } from '../pages/errors';
import { SnapshotApplicationService } from './snapshot-application.service';
import type { CapturedDocumentState } from './types/captured-document-state';
import type { CreateInternalSnapshotInput } from './types/snapshot-creation';
import type { SnapshotMetadata } from './types/snapshot-metadata';
import type { CreateSnapshotInternalUseCase } from './use-cases/create-snapshot-internal.use-case';
import type { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';

const pageId = 'page-1';
const actorId = 'editor-1';
const captured: CapturedDocumentState = {
  storageRevision: 42n,
  tiptapSchemaVersion: 6,
  yjsState: new Uint8Array([1, 2, 3]),
};
const metadata: SnapshotMetadata = {
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  createdBy: { id: actorId, name: 'Editor' },
  id: 'snapshot-1',
  reason: SnapshotReason.manual,
  revision: 1n,
  sourceStorageRevision: captured.storageRevision,
  tiptapSchemaVersion: captured.tiptapSchemaVersion,
};

function setup() {
  const order: string[] = [];
  const captureClient = {
    capture: vi.fn(async () => {
      order.push('capture');
      return captured;
    }),
  };
  const permissions = {
    requireRole: vi.fn(async () => {
      order.push('permission');
      return PageRole.EDITOR;
    }),
  };
  const createSnapshotManual = {
    execute: vi.fn(async () => metadata),
  };

  return {
    order,
    service: new SnapshotApplicationService(
      captureClient as never,
      permissions as never,
      createSnapshotManual as unknown as CreateSnapshotManualUseCase,
    ),
    captureClient,
    permissions,
    createSnapshotManual,
  };
}

describe('SnapshotApplicationService', () => {
  it('checks edit permission before capture and passes captured provenance unchanged', async () => {
    const { service, captureClient, permissions, createSnapshotManual, order } = setup();
    createSnapshotManual.execute.mockImplementation(async () => {
      order.push('snapshot');
      return metadata;
    });

    await expect(service.createManual(pageId, actorId)).resolves.toBe(metadata);

    expect(order).toEqual(['permission', 'capture', 'snapshot']);
    expect(permissions.requireRole).toHaveBeenCalledWith(actorId, pageId, PageRole.EDITOR);
    expect(captureClient.capture).toHaveBeenCalledWith(pageId);
    expect(createSnapshotManual.execute).toHaveBeenCalledWith({
      ...captured,
      pageId,
      createdById: actorId,
    });
  });

  it('does not capture for a user who fails the existing edit permission check', async () => {
    const { service, captureClient, permissions, createSnapshotManual } = setup();
    permissions.requireRole.mockRejectedValue(new PageRoleInsufficientError());

    await expect(service.createManual(pageId, actorId)).rejects.toBeInstanceOf(
      PageRoleInsufficientError,
    );

    expect(captureClient.capture).not.toHaveBeenCalled();
    expect(createSnapshotManual.execute).not.toHaveBeenCalled();
  });

  it('does not create a snapshot when capture fails', async () => {
    const { service, captureClient, createSnapshotManual } = setup();
    captureClient.capture.mockRejectedValue(new Error('capture unavailable'));

    await expect(service.createManual(pageId, actorId)).rejects.toThrow('capture unavailable');

    expect(createSnapshotManual.execute).not.toHaveBeenCalled();
  });

  it('allows trusted callers to reuse one capture for snapshot creation and derived work', async () => {
    const { service, captureClient } = setup();
    const createSnapshotInternal = {
      execute: vi.fn(async (_input: CreateInternalSnapshotInput) => metadata),
    } as unknown as CreateSnapshotInternalUseCase;
    const capturedState = await service.captureCurrentDocument(pageId);

    await createSnapshotInternal.execute({
      createdById: null,
      pageId,
      reason: SnapshotReason.publication,
      ...capturedState,
    });

    expect(captureClient.capture).toHaveBeenCalledOnce();
    expect(createSnapshotInternal.execute).toHaveBeenCalledWith({
      createdById: null,
      pageId,
      reason: SnapshotReason.publication,
      ...captured,
    });
  });
});
