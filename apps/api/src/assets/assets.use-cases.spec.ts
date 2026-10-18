import { Readable } from 'node:stream';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../config/application-config';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { AssetsUseCases } from './assets.use-cases';
import { InMemoryObjectStorage } from './storage/in-memory-object-storage';

const actorId = '550e8400-e29b-41d4-a716-446655440000';
const assetId = '550e8400-e29b-41d4-a716-446655440001';
const originalKey = `assets/${assetId}/550e8400-e29b-41d4-a716-446655440002`;

describe('AssetsUseCases', () => {
  let storage: InMemoryObjectStorage;
  let prisma: {
    asset: {
      findUnique: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    pageAssetGrant: { findMany: ReturnType<typeof vi.fn> };
  };
  let useCases: AssetsUseCases;

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    const asset = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey: originalKey,
      status: 'pending',
      mimeType: null,
      sizeBytes: null,
      checksum: null,
    };
    prisma = {
      asset: {
        findUnique: vi.fn(async () => asset),
        findUniqueOrThrow: vi.fn(async () => asset),
        updateMany: vi.fn(),
        findMany: vi.fn(async () => []),
      },
      pageAssetGrant: { findMany: vi.fn(async () => []) },
    };
    const permissions = {
      requireRole: vi.fn(),
    } as unknown as PagePermissionsService;
    const config = {
      assets: {
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadTimeoutMs: 5_000,
      },
    } as ApplicationConfig;
    useCases = new AssetsUseCases(prisma as never, permissions, storage, config);
  });

  it('keeps a committed ready object when the PostgreSQL response is ambiguous', async () => {
    const committedAsset = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey: originalKey,
      status: 'pending' as string,
      mimeType: null as string | null,
      sizeBytes: null as bigint | null,
      checksum: null as string | null,
    };
    prisma.asset.findUnique.mockImplementation(async () => committedAsset);
    prisma.asset.updateMany
      .mockImplementationOnce(async ({ data }: { data: { storageKey: string } }) => {
        committedAsset.storageKey = data.storageKey;
        return { count: 1 };
      })
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(committedAsset, data);
        throw new Error('connection timed out after PostgreSQL commit');
      });
    const deleteObject = vi.spyOn(storage, 'deleteObject');
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const request = Object.assign(Readable.from([pngHeader]), {
      headers: { 'content-length': String(pngHeader.length), 'content-type': 'image/png' },
    }) as Request;

    await expect(useCases.upload(actorId, assetId, request)).rejects.toThrow(
      'connection timed out after PostgreSQL commit',
    );

    expect(committedAsset.status).toBe('ready');
    expect(storage.objects.has(committedAsset.storageKey)).toBe(true);
    await useCases.reconcileDeletedAssets();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(storage.objects.has(committedAsset.storageKey)).toBe(true);
  });
});
