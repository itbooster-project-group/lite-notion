import { Readable } from 'node:stream';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../config/application-config';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { AssetGcUseCases } from './asset-gc.use-cases';
import { AssetUploadUseCases } from './asset-upload.use-cases';
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
    pageAssetGrant: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique?: ReturnType<typeof vi.fn>;
    };
    pageAsset?: { findFirst: ReturnType<typeof vi.fn> };
    page?: { findFirst: ReturnType<typeof vi.fn> };
    pageDocument?: { findUnique: ReturnType<typeof vi.fn> };
    pageAssetProjection?: { findUnique: ReturnType<typeof vi.fn> };
  };
  let useCases: AssetsUseCases;
  let uploadUseCases: AssetUploadUseCases;
  let gcUseCases: AssetGcUseCases;
  let permissions: PagePermissionsService;

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
    permissions = {
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
    uploadUseCases = new AssetUploadUseCases(prisma as never, permissions, storage, config);
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

    await expect(uploadUseCases.upload(actorId, assetId, request)).rejects.toThrow(
      'connection timed out after PostgreSQL commit',
    );

    expect(committedAsset.status).toBe('ready');
    expect(storage.objects.has(committedAsset.storageKey)).toBe(true);
    gcUseCases = new AssetGcUseCases(prisma as never, storage, {
      assets: { gcBatchSize: 3 },
    } as ApplicationConfig);
    await gcUseCases.reconcileDeletedAssets();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(storage.objects.has(committedAsset.storageKey)).toBe(true);
  });

  it('does not let a failed concurrent PUT change the winning attempt to failed', async () => {
    const current = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey: originalKey,
      status: 'pending',
      mimeType: null as string | null,
      sizeBytes: null as bigint | null,
      checksum: null as string | null,
    };
    const invalidRead = deferred();
    prisma.asset.findUnique.mockImplementation(async () => {
      invalidRead.resolve();
      return { ...current };
    });
    prisma.asset.findUniqueOrThrow.mockImplementation(async () => current);
    prisma.asset.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { storageKey: string; status: string };
        data: Partial<typeof current>;
      }) => {
        if (data.storageKey) {
          if (current.status !== where.status || current.storageKey !== where.storageKey) {
            return { count: 0 };
          }
          Object.assign(current, data);
          return { count: 1 };
        }
        if (current.status !== where.status || current.storageKey !== where.storageKey) {
          return { count: 0 };
        }
        Object.assign(current, data);
        return { count: 1 };
      },
    );

    let releaseInvalid!: () => void;
    const invalidBytes = new Promise<void>((resolve) => {
      releaseInvalid = resolve;
    });
    const invalidStream = Readable.from(
      (async function* () {
        await invalidBytes;
        yield Buffer.from('invalid image');
      })(),
    );
    const invalidRequest = Object.assign(invalidStream, {
      headers: { 'content-type': 'application/octet-stream' },
    }) as Request;
    const invalidUpload = uploadUseCases.upload(actorId, assetId, invalidRequest);
    await invalidRead.promise;

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const validRequest = Object.assign(Readable.from([pngHeader]), {
      headers: { 'content-length': String(pngHeader.length), 'content-type': 'image/png' },
    }) as Request;
    await uploadUseCases.upload(actorId, assetId, validRequest);
    expect(current.status).toBe('ready');

    releaseInvalid();
    await expect(invalidUpload).rejects.toMatchObject({ status: 415 });
    expect(current.status).toBe('ready');
  });

  it('does not let a later invalid PUT supersede an active valid upload', async () => {
    const current = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey: originalKey,
      status: 'pending',
      mimeType: null as string | null,
      sizeBytes: null as bigint | null,
      checksum: null as string | null,
    };
    prisma.asset.findUnique.mockImplementation(async () => current);
    prisma.asset.findUniqueOrThrow.mockImplementation(async () => current);
    const validAttemptClaimed = deferred();
    prisma.asset.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { storageKey: string; status: string };
        data: Partial<typeof current>;
      }) => {
        if (current.status !== where.status || current.storageKey !== where.storageKey) {
          return { count: 0 };
        }
        Object.assign(current, data);
        if (typeof data.storageKey === 'string' && data.storageKey.includes('/attempt-')) {
          validAttemptClaimed.resolve();
        }
        return { count: 1 };
      },
    );
    const putObject = storage.putObject.bind(storage);
    let releaseValidStorage!: () => void;
    const validStorageGate = new Promise<void>((resolve) => {
      releaseValidStorage = resolve;
    });
    vi.spyOn(storage, 'putObject').mockImplementation(async (key, input) => {
      await validStorageGate;
      await putObject(key, input);
    });

    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const validRequest = Object.assign(Readable.from([pngHeader]), {
      headers: { 'content-length': String(pngHeader.length), 'content-type': 'image/png' },
    }) as Request;
    const validUpload = uploadUseCases.upload(actorId, assetId, validRequest);
    await validAttemptClaimed.promise;
    const validAttemptKey = current.storageKey;

    const invalidRequest = Object.assign(Readable.from([Buffer.from('not an image')]), {
      headers: { 'content-type': 'application/octet-stream' },
    }) as Request;
    await expect(uploadUseCases.upload(actorId, assetId, invalidRequest)).rejects.toMatchObject({
      status: 415,
    });
    expect(current.status).toBe('pending');
    expect(current.storageKey).toBe(validAttemptKey);

    releaseValidStorage();
    await expect(validUpload).resolves.toMatchObject({ id: assetId, status: 'ready' });
    expect(current.status).toBe('ready');
    expect(current.storageKey).toBe(validAttemptKey);
  });

  it('marks an invalid upload failed when its original intent is still current', async () => {
    const current = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey: originalKey,
      status: 'pending',
    };
    prisma.asset.findUnique.mockImplementation(async () => ({ ...current }));
    prisma.asset.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { storageKey: string; status: string };
        data: Partial<typeof current>;
      }) => {
        if (current.status !== where.status || current.storageKey !== where.storageKey) {
          return { count: 0 };
        }
        Object.assign(current, data);
        return { count: 1 };
      },
    );
    const invalidRequest = Object.assign(Readable.from([Buffer.from('not an image')]), {
      headers: { 'content-type': 'application/octet-stream' },
    }) as Request;

    await expect(uploadUseCases.upload(actorId, assetId, invalidRequest)).rejects.toMatchObject({
      status: 415,
    });

    expect(current.status).toBe('failed');
  });

  it('fails closed when a page asset reference is ahead of the projection', async () => {
    vi.spyOn(permissions, 'requireRole').mockResolvedValue('viewer' as never);
    prisma.asset.findUnique.mockResolvedValue({
      id: assetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 8n,
      originalName: 'image.png',
    } as never);
    prisma.pageAssetGrant.findUnique = vi.fn(async () => ({ pageId, assetId }));
    prisma.pageAsset = { findFirst: vi.fn(async () => ({ pageId, assetId })) };
    prisma.page = { findFirst: vi.fn(async () => null) };
    prisma.pageDocument = { findUnique: vi.fn(async () => ({ storageRevision: 2n })) };
    prisma.pageAssetProjection = {
      findUnique: vi.fn(async () => ({ sourceStorageRevision: 1n })),
    };
    await expect(useCases.metadataForPage(actorId, assetId, pageId)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('limits orphan scanning to one configured storage page per cleanup pass', async () => {
    const listObjects = vi.spyOn(storage, 'listObjects');
    const keys = [
      '550e8400-e29b-41d4-a716-446655440010',
      '550e8400-e29b-41d4-a716-446655440011',
      '550e8400-e29b-41d4-a716-446655440012',
      '550e8400-e29b-41d4-a716-446655440013',
    ].map((id) => `assets/${assetId}/${id}`);
    for (const key of keys) {
      await storage.putObject(key, {
        body: Readable.from([Buffer.from([1])]),
        checksum: 'checksum',
        contentLength: 1,
        contentType: 'image/png',
      });
      const stored = storage.objects.get(key);
      if (stored) stored.lastModified = new Date(0);
    }
    prisma.asset.findUnique.mockResolvedValue(null);
    const config = {
      assets: {
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadTimeoutMs: 5_000,
        gcBatchSize: 3,
        orphanGraceHours: 0,
      },
    } as ApplicationConfig;
    gcUseCases = new AssetGcUseCases(prisma as never, storage, config);

    await gcUseCases.cleanupOrphanedObjects();

    expect(listObjects).toHaveBeenCalledOnce();
    expect(listObjects).toHaveBeenCalledWith('assets/', undefined, 3);
    expect(storage.objects.size).toBe(1);

    await gcUseCases.cleanupOrphanedObjects();

    expect(listObjects).toHaveBeenCalledTimes(2);
    expect(listObjects.mock.calls[1]).toEqual(['assets/', keys[2], 3]);
    expect(storage.objects.size).toBe(0);
  });

  it('keeps orphan candidates when PostgreSQL cannot confirm key ownership', async () => {
    const key = `assets/${assetId}/550e8400-e29b-41d4-a716-446655440014`;
    await storage.putObject(key, {
      body: Readable.from([Buffer.from([1])]),
      checksum: 'checksum',
      contentLength: 1,
      contentType: 'image/png',
    });
    const stored = storage.objects.get(key);
    if (stored) stored.lastModified = new Date(0);
    prisma.asset.findUnique.mockRejectedValue(new Error('database unavailable'));
    gcUseCases = new AssetGcUseCases(prisma as never, storage, {
      assets: {
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadTimeoutMs: 5_000,
        gcBatchSize: 3,
        orphanGraceHours: 0,
      },
    } as ApplicationConfig);

    await gcUseCases.cleanupOrphanedObjects();

    expect(storage.objects.has(key)).toBe(true);
  });

  it('keeps an aged storage object while its key is still used by a ready asset', async () => {
    const key = `assets/${assetId}/550e8400-e29b-41d4-a716-446655440015`;
    await storage.putObject(key, {
      body: Readable.from([Buffer.from([1])]),
      checksum: 'checksum',
      contentLength: 1,
      contentType: 'image/png',
    });
    const stored = storage.objects.get(key);
    if (stored) stored.lastModified = new Date(0);
    prisma.asset.findUnique.mockResolvedValue({ status: 'ready' } as never);
    gcUseCases = new AssetGcUseCases(prisma as never, storage, {
      assets: {
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        uploadTimeoutMs: 5_000,
        gcBatchSize: 3,
        orphanGraceHours: 0,
      },
    } as ApplicationConfig);

    await gcUseCases.cleanupOrphanedObjects();

    expect(storage.objects.has(key)).toBe(true);
  });

  it('reconciles later tombstones over multiple bounded passes', async () => {
    const ids = [
      '550e8400-e29b-41d4-a716-446655440020',
      '550e8400-e29b-41d4-a716-446655440021',
      '550e8400-e29b-41d4-a716-446655440022',
      '550e8400-e29b-41d4-a716-446655440023',
      '550e8400-e29b-41d4-a716-446655440024',
    ];
    const deletedAssets = ids.map((id, index) => ({
      id,
      status: 'deleted',
      storageKey: `assets/${id}/550e8400-e29b-41d4-a716-${String(index + 30).padStart(12, '0')}`,
    }));
    for (const asset of deletedAssets) {
      await storage.putObject(asset.storageKey, {
        body: Readable.from([Buffer.from([1])]),
        checksum: 'checksum',
        contentLength: 1,
        contentType: 'image/png',
      });
    }
    const queryPage = vi.spyOn(prisma.asset, 'findMany').mockImplementation((async (args: {
      cursor?: { id: string };
      skip?: number;
      take: number;
    }) => {
      const cursorIndex = args.cursor
        ? deletedAssets.findIndex(({ id }) => id === args.cursor?.id) + (args.skip ?? 0)
        : 0;
      return deletedAssets.slice(cursorIndex, cursorIndex + args.take);
    }) as never);
    prisma.asset.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const asset = deletedAssets.find(({ id }) => id === where.id);
      return asset ? { status: asset.status, storageKey: asset.storageKey } : null;
    });
    const gcBatchSize = 2;
    gcUseCases = new AssetGcUseCases(prisma as never, storage, {
      assets: { gcBatchSize },
    } as ApplicationConfig);

    await gcUseCases.reconcileDeletedAssets();
    expect(storage.objects.size).toBe(3);
    await gcUseCases.reconcileDeletedAssets();
    expect(storage.objects.size).toBe(1);
    await gcUseCases.reconcileDeletedAssets();

    expect(storage.objects.size).toBe(0);
    expect(queryPage).toHaveBeenCalledTimes(3);
    expect(queryPage.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: ids[1] },
      skip: 1,
      take: gcBatchSize,
    });
    expect(queryPage.mock.calls[2]?.[0]).toMatchObject({
      cursor: { id: ids[3] },
      skip: 1,
      take: gcBatchSize,
    });
  });
});

const pageId = '550e8400-e29b-41d4-a716-446655440003';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
