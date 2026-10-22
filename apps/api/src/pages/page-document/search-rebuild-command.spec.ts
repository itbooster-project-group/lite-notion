import { describe, expect, it, vi } from 'vitest';
import { rebuildSearchProjections } from '../../../scripts/rebuild-search-projection';
import type { PrismaService } from '../../database/prisma.service';
import type { PageDocumentRecord } from './page-document.repository';
import type { ProjectPageSearchUseCase } from './use-cases/project-page-search.use-case';

function record(pageId: string): PageDocumentRecord {
  return {
    pageId,
    storageRevision: 1n,
    tiptapSchemaVersion: 2,
    yjsState: new Uint8Array(),
  };
}

describe('rebuildSearchProjections', () => {
  it('uses bounded batches and keeps processing after a corrupt document', async () => {
    const firstBatch = Array.from({ length: 25 }, (_, index) => record(`page-${index}`));
    const lastRecord = record('page-25');
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce(firstBatch)
        .mockResolvedValueOnce([lastRecord])
        .mockResolvedValueOnce([]),
    };
    const projection = {
      execute: vi.fn(async ({ pageId }: PageDocumentRecord) =>
        pageId === 'page-4' ? 'failed' : 'projected',
      ),
    };

    await expect(
      rebuildSearchProjections(
        prisma as unknown as PrismaService,
        projection as unknown as ProjectPageSearchUseCase,
        false,
      ),
    ).resolves.toEqual({ failed: 1, processed: 26, projected: 25, skipped: 0, stale: 0 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    expect(projection.execute).toHaveBeenCalledTimes(26);
    expect(projection.execute).toHaveBeenCalledWith(lastRecord, false);
  });

  it('passes forced rebuild mode through to the shared indexer', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([record('page-1')])
        .mockResolvedValueOnce([]),
    };
    const projection = { execute: vi.fn(async () => 'projected') };

    await expect(
      rebuildSearchProjections(
        prisma as unknown as PrismaService,
        projection as unknown as ProjectPageSearchUseCase,
        true,
      ),
    ).resolves.toEqual({ failed: 0, processed: 1, projected: 1, skipped: 0, stale: 0 });
    expect(projection.execute).toHaveBeenCalledWith(record('page-1'), true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
