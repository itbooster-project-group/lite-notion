import { describe, expect, it, vi } from 'vitest';
import type { TransactionScope } from '../../../database/transaction';
import type { PageDocumentRecord } from '../page-document.repository';
import type { PageSearchProjectionRepository } from '../page-search-projection.repository';
import { ProjectPageSearchUseCase } from './project-page-search.use-case';

const record: PageDocumentRecord = {
  pageId: '550e8400-e29b-41d4-a716-446655440000',
  storageRevision: 4n,
  tiptapSchemaVersion: 2,
  yjsState: new Uint8Array(),
};
const scope = {} as TransactionScope;

function fixture(
  options: {
    currentRevision?: bigint | null;
    projectionState?: {
      sourceStorageRevision: bigint | null;
      attemptedStorageRevision: bigint | null;
      attemptCount: number;
    } | null;
    writeError?: Error;
    failureWriteError?: Error;
  } = {},
) {
  const boundDocumentRepository = {
    lockForSearchProjection: vi.fn(async () =>
      options.currentRevision === undefined ? record.storageRevision : options.currentRevision,
    ),
  };
  const documentRepository = {
    bind: vi.fn(() => boundDocumentRepository),
  };
  const boundProjectionRepository = {
    writeSuccess: vi.fn(async () => {
      if (options.writeError) throw options.writeError;
      return true;
    }),
    findFailureState: vi.fn(async () => options.projectionState ?? null),
    writeFailure: vi.fn(async () => {
      if (options.failureWriteError) throw options.failureWriteError;
    }),
  };
  const projectionRepository = {
    findFailureState: vi.fn(async () => options.projectionState ?? null),
    bind: vi.fn(() => boundProjectionRepository),
  };
  const transactions = {
    run: vi.fn(async (operation: (transaction: TransactionScope) => Promise<unknown>) =>
      operation(scope),
    ),
  };
  const useCase = new ProjectPageSearchUseCase(
    transactions as never,
    documentRepository as never,
    projectionRepository as unknown as PageSearchProjectionRepository,
  );

  return { boundDocumentRepository, boundProjectionRepository, useCase };
}

describe('ProjectPageSearchUseCase', () => {
  it('writes an empty persisted document as an indexed revision', async () => {
    const { boundProjectionRepository, useCase } = fixture();

    await expect(useCase.execute(record)).resolves.toBe('projected');
    expect(boundProjectionRepository.writeSuccess).toHaveBeenCalledWith(
      record.pageId,
      '',
      record.storageRevision,
    );
  });

  it('skips a successful equal revision unless a rebuild is forced', async () => {
    const { boundProjectionRepository, useCase } = fixture({
      projectionState: {
        attemptCount: 0,
        attemptedStorageRevision: record.storageRevision,
        sourceStorageRevision: record.storageRevision,
      },
    });

    await expect(useCase.execute(record)).resolves.toBe('skipped');
    await expect(useCase.execute(record, true)).resolves.toBe('projected');
    expect(boundProjectionRepository.writeSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not write when the authoritative revision changed during extraction', async () => {
    const { boundProjectionRepository, useCase } = fixture({ currentRevision: 5n });

    await expect(useCase.execute(record)).resolves.toBe('stale');
    expect(boundProjectionRepository.writeSuccess).not.toHaveBeenCalled();
    expect(boundProjectionRepository.writeFailure).not.toHaveBeenCalled();
  });

  it('records a first permanent extraction failure as a placeholder retry state', async () => {
    const { boundProjectionRepository, useCase } = fixture();

    await expect(useCase.execute({ ...record, tiptapSchemaVersion: 99 }, true)).resolves.toBe(
      'failed',
    );
    expect(boundProjectionRepository.writeFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 1,
        lastErrorCode: 'permanent_validation',
        pageId: record.pageId,
        retryAfter: null,
        storageRevision: record.storageRevision,
      }),
    );
  });

  it('records corrupted persisted Yjs bytes as a permanent projection failure', async () => {
    const { boundProjectionRepository, useCase } = fixture();

    await expect(
      useCase.execute({ ...record, yjsState: new Uint8Array([255, 255, 255]) }),
    ).resolves.toBe('failed');
    expect(boundProjectionRepository.writeFailure).toHaveBeenCalledWith(
      expect.objectContaining({ lastErrorCode: 'permanent_validation' }),
    );
  });

  it('preserves a successful projection and its retry state when projection building fails', async () => {
    const { boundProjectionRepository, useCase } = fixture({
      projectionState: {
        attemptCount: 0,
        attemptedStorageRevision: record.storageRevision,
        sourceStorageRevision: record.storageRevision,
      },
    });

    await expect(useCase.execute({ ...record, tiptapSchemaVersion: 99 }, true)).resolves.toBe(
      'failed',
    );
    expect(boundProjectionRepository.writeFailure).not.toHaveBeenCalled();
  });

  it('records a transient database write failure without throwing to persistence callers', async () => {
    const { boundProjectionRepository, useCase } = fixture({
      projectionState: {
        attemptCount: 0,
        attemptedStorageRevision: null,
        sourceStorageRevision: null,
      },
      writeError: new Error('database unavailable'),
    });

    await expect(useCase.execute(record)).resolves.toBe('failed');
    expect(boundProjectionRepository.writeFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptCount: 1,
        lastErrorCode: 'transient_projection',
        retryAfter: expect.any(Date),
      }),
    );
  });

  it('reports a retry-state storage failure so the scheduler can stop the batch', async () => {
    const { useCase } = fixture({
      failureWriteError: new Error('database unavailable'),
      writeError: new Error('database unavailable'),
    });

    await expect(useCase.execute(record)).resolves.toBe('retry-state-failed');
  });
});
