import { describe, expect, it, vi } from 'vitest';
import type { CapturedDocumentState } from '../../document-capture/captured-document-state';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PageRole } from '../../page-permissions/constants';
import { PageRoleInsufficientError } from '../../pages/errors';
import type { SnapshotMetadata } from '../types/snapshot-metadata';
import { CreateCurrentManualSnapshotUseCase } from './create-current-manual-snapshot.use-case';
import type { CreateSnapshotManualUseCase } from './create-snapshot-manual.use-case';

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
  const capture = {
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
    execute: vi.fn(async () => {
      order.push('snapshot');
      return metadata;
    }),
  };

  return {
    order,
    useCase: new CreateCurrentManualSnapshotUseCase(
      permissions as never,
      capture as never,
      createSnapshotManual as unknown as CreateSnapshotManualUseCase,
    ),
    capture,
    permissions,
    createSnapshotManual,
  };
}

describe('CreateCurrentManualSnapshotUseCase', () => {
  it('prechecks edit permission, captures once, and passes the captured state to creation', async () => {
    const { useCase, capture, permissions, createSnapshotManual, order } = setup();

    await expect(useCase.execute(pageId, actorId)).resolves.toBe(metadata);

    expect(order).toEqual(['permission', 'capture', 'snapshot']);
    expect(permissions.requireRole).toHaveBeenCalledWith(actorId, pageId, PageRole.EDITOR);
    expect(capture.capture).toHaveBeenCalledOnce();
    expect(capture.capture).toHaveBeenCalledWith(pageId);
    expect(createSnapshotManual.execute).toHaveBeenCalledWith({
      createdById: actorId,
      pageId,
      storageRevision: captured.storageRevision,
      tiptapSchemaVersion: captured.tiptapSchemaVersion,
      yjsState: captured.yjsState,
    });
  });

  it('does not capture or create a snapshot when precheck permission fails', async () => {
    const { useCase, capture, permissions, createSnapshotManual } = setup();
    permissions.requireRole.mockRejectedValue(new PageRoleInsufficientError());

    await expect(useCase.execute(pageId, actorId)).rejects.toBeInstanceOf(
      PageRoleInsufficientError,
    );

    expect(capture.capture).not.toHaveBeenCalled();
    expect(createSnapshotManual.execute).not.toHaveBeenCalled();
  });

  it('does not create a snapshot when capture fails', async () => {
    const { useCase, capture, createSnapshotManual } = setup();
    capture.capture.mockRejectedValue(new Error('capture unavailable'));

    await expect(useCase.execute(pageId, actorId)).rejects.toThrow('capture unavailable');

    expect(capture.capture).toHaveBeenCalledOnce();
    expect(createSnapshotManual.execute).not.toHaveBeenCalled();
  });
});
