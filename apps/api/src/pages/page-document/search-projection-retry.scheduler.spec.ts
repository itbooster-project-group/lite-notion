import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import type { PageDocumentRecord } from './page-document.repository';
import { SearchProjectionRetryScheduler } from './search-projection-retry.scheduler';
import type { ProjectPageSearchUseCase } from './use-cases/project-page-search.use-case';

const record = (pageId: string): PageDocumentRecord => ({
  pageId,
  storageRevision: 2n,
  tiptapSchemaVersion: 2,
  yjsState: new Uint8Array(),
});

function scheduler(
  records: PageDocumentRecord[],
  execute: (input: PageDocumentRecord) => Promise<string> = async () => 'projected',
) {
  const prisma = { $queryRaw: vi.fn(async () => records) };
  const projection = { execute: vi.fn(execute) };
  return {
    instance: new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      projection as unknown as ProjectPageSearchUseCase,
    ),
    prisma,
    projection,
  };
}

describe('SearchProjectionRetryScheduler', () => {
  it('stops the current batch when retry diagnostics could not be persisted', async () => {
    const { instance, projection } = scheduler(
      [record('page-1'), record('page-2')],
      async () => 'retry-state-failed',
    );

    await instance.retryStaleProjections();

    expect(projection.execute).toHaveBeenCalledTimes(1);
  });

  it('uses a local re-entry guard while a batch is running', async () => {
    let release!: () => void;
    let started!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    const began = new Promise<void>((resolve) => (started = resolve));
    const { instance, prisma } = scheduler([record('page-1')], async () => {
      started();
      await wait;
      return 'projected';
    });

    const first = instance.retryStaleProjections();
    await began;
    await instance.retryStaleProjections();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('recovers from candidate scan errors and can run on the next interval', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValue([]),
    };
    const projection = { execute: vi.fn() };
    const instance = new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      projection as unknown as ProjectPageSearchUseCase,
    );

    await expect(instance.retryStaleProjections()).resolves.toBeUndefined();
    await expect(instance.retryStaleProjections()).resolves.toBeUndefined();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
