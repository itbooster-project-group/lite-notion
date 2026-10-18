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

  it('keeps automatic retries bounded and suppresses permanent or not-yet-due failures', async () => {
    const query = vi.fn(async (..._args: unknown[]) => []);
    const prisma = { $queryRaw: query };
    const projection = { execute: vi.fn(async () => undefined) };
    const scheduler = new ProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      projection as unknown as ProjectPageAssetsUseCase,
    );

    await scheduler.retryStaleProjections();

    const [statement, maxAttempts, batchSize] = query.mock.calls[0] ?? [];
    const sql = Array.isArray(statement) ? statement.join(' ') : '';
    expect(sql).toContain('projection."attemptCount" <');
    expect(sql).toContain('projection."retryAfter" <= NOW()');
    expect(sql).toContain("'permanent_validation'");
    expect(sql).toContain("'retry_exhausted'");
    expect(sql).toContain('LIMIT');
    expect(maxAttempts).toBe(5);
    expect(batchSize).toBe(25);
  });
});
