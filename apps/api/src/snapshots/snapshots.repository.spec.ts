import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { PrismaSnapshotsRepository } from './snapshots.repository';

describe('PrismaSnapshotsRepository metadata queries', () => {
  it('lists snapshots by page in descending revision order without selecting Yjs state', async () => {
    const calls: unknown[] = [];
    const delegate = {
      findMany: vi.fn(async (args: unknown) => {
        calls.push(args);

        return [];
      }),
    };
    const repository = new PrismaSnapshotsRepository({
      documentSnapshot: delegate,
    } as unknown as PrismaService);

    await repository.listMetadataByPage('page-id');

    expect(calls[0]).toMatchObject({
      orderBy: { revision: 'desc' },
      where: { pageId: 'page-id' },
    });
    expect(calls[0]).not.toHaveProperty('select.yjsState');
  });

  it('looks up metadata by both page id and snapshot id', async () => {
    const calls: unknown[] = [];
    const delegate = {
      findFirst: vi.fn(async (args: unknown) => {
        calls.push(args);

        return null;
      }),
    };
    const repository = new PrismaSnapshotsRepository({
      documentSnapshot: delegate,
    } as unknown as PrismaService);

    await repository.findMetadataByPageAndId('page-id', 'snapshot-id');

    expect(calls[0]).toMatchObject({ where: { id: 'snapshot-id', pageId: 'page-id' } });
    expect(calls[0]).not.toHaveProperty('select.yjsState');
  });
});
