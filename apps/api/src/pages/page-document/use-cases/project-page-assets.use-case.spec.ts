import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service';
import type { PageDocumentRecord } from '../page-document.repository';
import { ProjectPageAssetsUseCase } from './project-page-assets.use-case';

const record: PageDocumentRecord = {
  pageId: '550e8400-e29b-41d4-a716-446655440000',
  storageRevision: 4n,
  tiptapSchemaVersion: 2,
  yjsState: new Uint8Array(),
};

function testPrisma(options: { currentRevision?: bigint; transactionError?: Error } = {}) {
  let failTransaction = options.transactionError !== undefined;
  const tx = {
    $queryRaw: vi.fn(async () => {
      if (failTransaction) {
        failTransaction = false;
        throw options.transactionError;
      }
      return [];
    }),
    asset: { findMany: vi.fn(async () => []) },
    pageAsset: {
      createMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    pageAssetGrant: { findMany: vi.fn(async () => []) },
    pageAssetProjection: {
      findUnique: vi.fn(async () => ({ attemptCount: 0, attemptedStorageRevision: null })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    pageDocument: {
      findUnique: vi.fn(async () => ({
        storageRevision: options.currentRevision ?? record.storageRevision,
      })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
  };
  return { prisma, tx };
}

describe('ProjectPageAssetsUseCase', () => {
  it('marks the exact empty document revision projected', async () => {
    const { prisma, tx } = testPrisma();
    await new ProjectPageAssetsUseCase(prisma as unknown as PrismaService).execute(record);
    expect(tx.pageAsset.deleteMany).toHaveBeenCalledWith({ where: { pageId: record.pageId } });
    expect(tx.pageAssetProjection.update).toHaveBeenCalledWith({
      where: { pageId: record.pageId },
      data: expect.objectContaining({ sourceStorageRevision: record.storageRevision }),
    });
  });

  it('does not let a stale captured revision overwrite the newer projection', async () => {
    const { prisma, tx } = testPrisma({ currentRevision: 5n });
    await new ProjectPageAssetsUseCase(prisma as unknown as PrismaService).execute(record);
    expect(tx.pageAsset.deleteMany).not.toHaveBeenCalled();
    expect(tx.pageAssetProjection.update).not.toHaveBeenCalled();
  });

  it('records a retryable transient error without failing document persistence', async () => {
    const { prisma, tx } = testPrisma({ transactionError: new Error('database timeout') });
    await expect(
      new ProjectPageAssetsUseCase(prisma as unknown as PrismaService).execute(record),
    ).resolves.toBeUndefined();
    expect(tx.pageAssetProjection.updateMany).toHaveBeenCalledWith({
      where: { pageId: record.pageId },
      data: expect.objectContaining({
        attemptedStorageRevision: record.storageRevision,
        attemptCount: 1,
        lastErrorCode: 'transient_projection',
        retryAfter: expect.any(Date),
      }),
    });
  });

  it('suppresses retries for permanent unsupported-schema errors', async () => {
    const { prisma, tx } = testPrisma();
    await new ProjectPageAssetsUseCase(prisma as unknown as PrismaService).execute({
      ...record,
      tiptapSchemaVersion: 99,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.pageAssetProjection.updateMany).toHaveBeenCalledWith({
      where: { pageId: record.pageId },
      data: expect.objectContaining({ lastErrorCode: 'permanent_validation', retryAfter: null }),
    });
  });
});
