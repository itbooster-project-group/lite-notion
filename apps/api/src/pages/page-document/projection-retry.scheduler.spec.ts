import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import type { PageDocumentRecord } from './page-document.repository';
import { ProjectionRetryScheduler } from './projection-retry.scheduler';
import { ProjectPageAssetsUseCase } from './use-cases/project-page-assets.use-case';

describe('ProjectionRetryScheduler', () => {
  it('rebuilds a stale persisted revision on a later tick without another document write', async () => {
    const record: PageDocumentRecord = {
      pageId: '550e8400-e29b-41d4-a716-446655440000',
      storageRevision: 9n,
      tiptapSchemaVersion: 2,
      yjsState: new Uint8Array(),
    };
    const query = vi.fn(async () => [record]);
    const prisma = { $queryRaw: query };
    const projection = { execute: vi.fn(async () => undefined) };
    const scheduler = new ProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      projection as unknown as ProjectPageAssetsUseCase,
    );

    await scheduler.retryStaleProjections();

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]).toContain(5);
    expect(projection.execute).toHaveBeenCalledWith(record);
  });
});
