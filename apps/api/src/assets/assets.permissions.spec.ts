import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../config/application-config';
import { PageRole } from '../page-permissions/constants';
import { AssetsUseCases } from './assets.use-cases';

const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const otherUserId = '550e8400-e29b-41d4-a716-446655440001';
const assetId = '550e8400-e29b-41d4-a716-446655440002';
const pageId = '550e8400-e29b-41d4-a716-446655440003';

function setup() {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    asset: {
      findFirst: vi.fn(async ({ where }: { where: { uploadedById?: string } }) =>
        where.uploadedById === ownerId ? { id: assetId } : null,
      ),
    },
    pageAssetGrant: {
      findUnique: vi.fn(async () => ({ pageId, assetId })),
      upsert: vi.fn(async () => ({})),
    },
    pageDocument: { findUnique: vi.fn(async () => ({ storageRevision: 0n })) },
    pageAssetProjection: { findUnique: vi.fn(async () => ({ sourceStorageRevision: 0n })) },
    userProfile: { upsert: vi.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    ),
    asset: {
      findUnique: vi.fn(async () => ({
        id: assetId,
        originalName: 'image.png',
        status: 'ready',
        mimeType: 'image/png',
        sizeBytes: 8n,
        storageKey: `assets/${assetId}/550e8400-e29b-41d4-a716-446655440004`,
      })),
      findFirst: vi.fn(async () => ({ id: assetId, storageKey: 'private-key' })),
    },
    pageAssetGrant: {
      findUnique: vi.fn(
        async (): Promise<{ pageId: string; assetId: string } | null> => ({
          pageId,
          assetId,
        }),
      ),
    },
    pageAsset: { findFirst: vi.fn(async () => null) },
    page: { findFirst: vi.fn(async () => null) },
    pageDocument: { findUnique: vi.fn(async () => ({ storageRevision: 0n })) },
    pageAssetProjection: { findUnique: vi.fn(async () => ({ sourceStorageRevision: 0n })) },
    userProfile: {
      findUnique: vi.fn(
        async (): Promise<{ avatarAssetId: string | null }> => ({
          avatarAssetId: assetId,
        }),
      ),
    },
  };
  const permissions = {
    requireRole: vi.fn(
      async (_actorId: string, _pageId: string, _minimumRole: PageRole): Promise<PageRole> =>
        PageRole.EDITOR,
    ),
  };
  const storage = { signedReadUrl: vi.fn(async () => 'https://signed.example/read') };
  const useCases = new AssetsUseCases(
    prisma as never,
    permissions as never,
    storage as never,
    { assets: { readUrlTtlSeconds: 60 } } as ApplicationConfig,
  );
  return { prisma, permissions, storage, tx, useCases };
}

describe('asset permission boundaries', () => {
  it('allows an editor to inspect a granted ready asset before its first document reference', async () => {
    const { useCases, permissions } = setup();

    await expect(useCases.metadataForPage(ownerId, assetId, pageId)).resolves.toMatchObject({
      id: assetId,
      status: 'ready',
    });
    expect(permissions.requireRole).toHaveBeenCalledWith(ownerId, pageId, PageRole.VIEWER);
  });

  it('does not grant a viewer cross-page access from an asset ID alone', async () => {
    const { useCases, prisma, permissions } = setup();
    permissions.requireRole.mockResolvedValue(PageRole.VIEWER);
    prisma.pageAssetGrant.findUnique.mockResolvedValue(null);

    await expect(useCases.metadataForPage(ownerId, assetId, pageId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('requires an effective editor role and uploader ownership to create a cross-page grant', async () => {
    const { useCases, permissions, tx } = setup();

    await expect(useCases.grant(otherUserId, pageId, assetId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(permissions.requireRole).toHaveBeenCalledWith(otherUserId, pageId, PageRole.EDITOR);
    expect(tx.pageAssetGrant.upsert).not.toHaveBeenCalled();

    await useCases.grant(ownerId, pageId, assetId);
    expect(tx.pageAssetGrant.upsert).toHaveBeenCalledOnce();
  });

  it('does not allow another user to attach or read an uploader-bound avatar', async () => {
    const { useCases, prisma, tx, storage } = setup();

    await expect(useCases.setAvatar(otherUserId, assetId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.userProfile.upsert).not.toHaveBeenCalled();

    prisma.userProfile.findUnique.mockResolvedValue({ avatarAssetId: null });
    await expect(useCases.readUrlForAvatar(assetId, ownerId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(storage.signedReadUrl).not.toHaveBeenCalled();
  });
});
