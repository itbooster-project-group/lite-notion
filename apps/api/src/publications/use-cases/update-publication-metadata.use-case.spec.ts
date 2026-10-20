import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionScope } from '../../database/transaction';
import { Prisma } from '../../generated/prisma/client';
import { PublicationSlugConflictError } from '../publication-errors';
import { UpdatePublicationMetadataUseCase } from './update-publication-metadata.use-case';

const page = { id: 'page-id', ownerId: 'owner-id' };
const current = {
  id: 'publication-id',
  pageId: page.id,
  publishedAt: null,
  slug: 'draft-slug',
  snapshotId: null,
  status: 'draft',
  updatedAt: new Date(),
  seoTitle: null,
  seoDescription: null,
};

function uniqueError(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
    clientVersion: 'test',
    code: 'P2002',
    meta: { target },
  });
}

describe('UpdatePublicationMetadataUseCase Prisma unique errors', () => {
  let useCase: UpdatePublicationMetadataUseCase;
  let updateMetadata: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateMetadata = vi.fn();
    const repository = {
      bind: () => repository,
      createRevalidation: vi.fn(),
      findByPage: vi.fn(async () => current),
      updateMetadata,
    };
    const pages = {
      bind: () => pages,
      findLiveById: vi.fn(async () => page),
    };
    const permissions = {
      bind: () => permissions,
      resolveRole: vi.fn(async () => 'owner'),
    };
    const transactions = {
      run: <T>(operation: (scope: TransactionScope) => Promise<T>): Promise<T> =>
        operation({ lock: async () => undefined }),
    };
    useCase = new UpdatePublicationMetadataUseCase(
      transactions as never,
      pages as never,
      permissions as never,
      repository as never,
    );
  });

  it('maps duplicate PagePublication.slug to the stable conflict error', async () => {
    updateMetadata.mockRejectedValueOnce(uniqueError(['slug']));

    await expect(
      useCase.execute({ actorId: 'owner-id', pageId: page.id, metadata: { slug: 'taken' } }),
    ).rejects.toBeInstanceOf(PublicationSlugConflictError);
  });

  it('propagates another unique violation without exposing it as a slug conflict', async () => {
    const error = uniqueError(['pageId']);
    updateMetadata.mockRejectedValueOnce(error);

    await expect(
      useCase.execute({ actorId: 'owner-id', pageId: page.id, metadata: { slug: 'new-slug' } }),
    ).rejects.toBe(error);
  });
});
