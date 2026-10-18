import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssetsUseCases } from '../../assets/assets.use-cases';
import { FilesystemObjectStorage } from '../../assets/storage/filesystem-object-storage';
import type { ApplicationConfig } from '../../config/application-config';
import { createPrismaClient, type PrismaClient } from '../../database/client';
import type { PrismaService } from '../../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../../database/transaction';
import type { DocumentCaptureClient } from '../../document-capture/document-capture.client';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PrismaPagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../../page-permissions/page-permissions.service';
import { PrismaSnapshotsRepository } from '../../snapshots/snapshots.repository';
import { CreateCurrentManualSnapshotUseCase } from '../../snapshots/use-cases/create-current-manual-snapshot.use-case';
import { CreateSnapshotManualUseCase } from '../../snapshots/use-cases/create-snapshot-manual.use-case';
import type { UsersService } from '../../users/users.service';
import { PrismaPagesRepository } from '../pages.repository';
import { PrismaPageDocumentRepository } from './page-document.repository';

describe('PageDocument provenance on PostgreSQL', () => {
  let prisma: PrismaClient;
  let storage: FilesystemObjectStorage;
  let storageDirectory: string;
  let ownerId: string;
  let projectId: string;
  const pageIds: string[] = [];
  const assetIds: string[] = [];

  async function createPage(): Promise<string> {
    const pageId = randomUUID();

    await prisma.page.create({
      data: {
        createdById: ownerId,
        id: pageId,
        ownerId,
        position: 'a',
        projectId,
        title: `document-${pageId}`,
        document: { create: { tiptapSchemaVersion: 1, yjsState: new Uint8Array() } },
        assetProjection: { create: { sourceStorageRevision: 0n } },
      },
    });
    pageIds.push(pageId);

    return pageId;
  }

  beforeAll(async () => {
    storageDirectory = await mkdtemp(join(tmpdir(), 'lite-notion-provenance-'));
    storage = new FilesystemObjectStorage(storageDirectory);
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    projectId = randomUUID();

    await prisma.user.create({
      data: {
        email: `${ownerId}@document-provenance.integration.test`,
        id: ownerId,
        name: ownerId,
        passwordHash: 'test-hash',
      },
    });
    await prisma.project.create({ data: { id: projectId, name: 'document provenance', ownerId } });
  });

  afterAll(async () => {
    try {
      if (pageIds.length > 0) {
        await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      }
      if (assetIds.length > 0) await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    } finally {
      await prisma.$disconnect();
      await rm(storageDirectory, { recursive: true, force: true });
    }
  });

  it('returns the exact bytes and revision from each concurrent persisted write', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const writes = [new Uint8Array([1, 2, 3]), new Uint8Array([9, 8, 7])];

    const records = await Promise.all(
      writes.map((yjsState) => repository.replaceYjsState(pageId, yjsState, 0n, 1)),
    );
    const persistedRecords = records.filter((record) => record !== null);
    expect(persistedRecords).toHaveLength(1);
    expect(records.filter((record) => record === null)).toHaveLength(1);
    const record = persistedRecords[0];
    expect(writes).toContainEqual(record?.yjsState);
    expect(record?.storageRevision).toBe(1n);
    expect(record?.tiptapSchemaVersion).toBe(1);

    const latest = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    expect(latest.storageRevision).toBe(1n);
    expect(record?.yjsState).toEqual(latest.yjsState);
  });

  it('starts a newly created empty page with a current asset projection watermark', async () => {
    const pageId = await createPage();
    const [document, projection] = await Promise.all([
      prisma.pageDocument.findUniqueOrThrow({
        where: { pageId },
        select: { storageRevision: true },
      }),
      prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } }),
    ]);
    expect(projection.sourceStorageRevision).toBe(document.storageRevision);
    expect(projection.sourceStorageRevision).toBe(0n);
  });

  it('allows an editor to upload immediately on a new page before any rebuild', async () => {
    const pageId = await createPage();
    const config = {
      assets: {
        gcBatchSize: 25,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 24,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 300,
        readUrlTtlSeconds: 60,
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
        s3: null,
      },
    } as unknown as ApplicationConfig;
    const assets = new AssetsUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const initiated = await assets.initiate(ownerId, pageId, 'cover.png');
    assetIds.push(initiated.assetId);
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=',
      'base64',
    );
    const request = Readable.from([bytes]) as Readable & Request;
    request.headers = { 'content-length': String(bytes.length), 'content-type': 'image/png' };

    const uploaded = await assets.upload(ownerId, initiated.assetId, request);
    const storedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: initiated.assetId } });
    const projection = await prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } });
    const document = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });

    expect(uploaded).toMatchObject({
      id: initiated.assetId,
      status: 'ready',
      mimeType: 'image/png',
    });
    expect(await storage.headObject(storedAsset.storageKey)).toMatchObject({
      checksum: expect.any(String),
      sizeBytes: bytes.length,
    });
    expect(projection.sourceStorageRevision).toBe(document.storageRevision);
  });

  it('keeps a committed ready object after the PostgreSQL acknowledgement is lost', async () => {
    const config = {
      assets: {
        gcBatchSize: 25,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 24,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 300,
        readUrlTtlSeconds: 60,
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
        s3: null,
      },
    } as unknown as ApplicationConfig;
    const assets = new AssetsUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const initiated = await assets.initiate(ownerId, undefined, 'ambiguous.png');
    assetIds.push(initiated.assetId);
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const request = Readable.from([bytes]) as Readable & Request;
    request.headers = { 'content-length': String(bytes.length), 'content-type': 'image/png' };
    const originalUpdateMany = prisma.asset.updateMany.bind(prisma.asset);
    const updateMany = vi.spyOn(prisma.asset, 'updateMany').mockImplementation((async (
      args: Parameters<typeof prisma.asset.updateMany>[0],
    ) => {
      const result = await originalUpdateMany(args);
      if (args.data.status === 'ready') {
        throw new Error('simulated lost PostgreSQL response after commit');
      }
      return result;
    }) as never);
    const deleteObject = vi.spyOn(storage, 'deleteObject');

    await expect(assets.upload(ownerId, initiated.assetId, request)).rejects.toThrow(
      'simulated lost PostgreSQL response after commit',
    );

    const stored = await prisma.asset.findUniqueOrThrow({ where: { id: initiated.assetId } });
    expect(stored.status).toBe('ready');
    expect(await storage.headObject(stored.storageKey)).not.toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
    updateMany.mockRestore();
  });

  it('retains referenced assets and deletes them only after an explicit request', async () => {
    const pageId = await createPage();
    const config = {
      assets: {
        gcBatchSize: 25,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 0,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 300,
        readUrlTtlSeconds: 60,
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
        s3: null,
      },
    } as unknown as ApplicationConfig;
    const assets = new AssetsUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const upload = async (contextPageId?: string) => {
      const initiated = await assets.initiate(ownerId, contextPageId, 'retained.png');
      assetIds.push(initiated.assetId);
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const request = Readable.from([bytes]) as Readable & Request;
      request.headers = { 'content-length': String(bytes.length), 'content-type': 'image/png' };
      await assets.upload(ownerId, initiated.assetId, request);
      return initiated.assetId;
    };

    const pageAssetId = await upload(pageId);
    await assets.setCover(ownerId, pageId, pageAssetId);
    await expect(assets.delete(ownerId, pageAssetId)).rejects.toThrow('Asset is still in use');
    await assets.setCover(ownerId, pageId, null);
    await prisma.pageAsset.create({ data: { pageId, assetId: pageAssetId, nodeId: 'node-1' } });
    await expect(assets.delete(ownerId, pageAssetId)).rejects.toThrow('Asset is still in use');
    await prisma.pageAsset.delete({
      where: { pageId_assetId_nodeId: { pageId, assetId: pageAssetId, nodeId: 'node-1' } },
    });
    await assets.delete(ownerId, pageAssetId);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: pageAssetId } })).status).toBe(
      'deleted',
    );
    expect(
      await storage.headObject(
        (
          await prisma.asset.findUniqueOrThrow({
            where: { id: pageAssetId },
          })
        ).storageKey,
      ),
    ).toBeNull();

    const avatarAssetId = await upload();
    await assets.setAvatar(ownerId, avatarAssetId);
    await expect(assets.delete(ownerId, avatarAssetId)).rejects.toThrow('Asset is still in use');
    await assets.setAvatar(ownerId, null);
    await assets.delete(ownerId, avatarAssetId);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: avatarAssetId } })).status).toBe(
      'deleted',
    );

    const racingAssetId = await upload(pageId);
    const [coverResult] = await Promise.allSettled([
      assets.setCover(ownerId, pageId, racingAssetId),
      assets.delete(ownerId, racingAssetId),
    ]);
    const [racingPage, racingAsset] = await Promise.all([
      prisma.page.findUniqueOrThrow({ where: { id: pageId }, select: { coverAssetId: true } }),
      prisma.asset.findUniqueOrThrow({ where: { id: racingAssetId } }),
    ]);
    if (racingPage.coverAssetId === racingAssetId) {
      expect(coverResult.status).toBe('fulfilled');
      expect(racingAsset.status).toBe('ready');
      expect(await storage.headObject(racingAsset.storageKey)).not.toBeNull();
    } else {
      expect(coverResult.status).toBe('rejected');
      expect(racingAsset.status).toBe('deleted');
      expect(await storage.headObject(racingAsset.storageKey)).toBeNull();
    }
  });

  it('reads persisted bytes and provenance from one document record', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const bytes = new Uint8Array([4, 5, 6]);
    const written = await repository.replaceYjsState(pageId, bytes, 0n, 1);

    await expect(repository.find(pageId)).resolves.toEqual(written);
  });

  it('creates a snapshot with the exact PostgreSQL persisted capture provenance', async () => {
    const pageId = await createPage();
    const client = prisma as unknown as DatabaseClient;
    const documentRepository = new PrismaPageDocumentRepository(client);
    const yjsState = new Uint8Array([21, 22, 23, 24]);
    const persisted = await documentRepository.replaceYjsState(pageId, yjsState, 0n, 1);

    if (persisted === null) {
      throw new Error('Expected a live page document');
    }

    const pages = new PrismaPagesRepository(client);
    const permissionsRepository = new PrismaPagePermissionsRepository(client);
    const permissions = new PagePermissionsService(permissionsRepository, {} as UsersService);
    const snapshotsRepository = new PrismaSnapshotsRepository(client);
    const createSnapshot = new CreateSnapshotManualUseCase(
      permissionsRepository,
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
      pages,
      snapshotsRepository,
    );
    const captureClient = {
      capture: async () => ({
        storageRevision: persisted.storageRevision,
        tiptapSchemaVersion: persisted.tiptapSchemaVersion,
        yjsState: persisted.yjsState,
      }),
    } as unknown as DocumentCaptureClient;
    const useCase = new CreateCurrentManualSnapshotUseCase(
      permissions,
      captureClient,
      createSnapshot,
    );

    const created = await useCase.execute(pageId, ownerId);
    const stored = await prisma.documentSnapshot.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.yjsState).toEqual(yjsState);
    expect(stored.sourceStorageRevision).toBe(persisted.storageRevision);
    expect(stored.tiptapSchemaVersion).toBe(persisted.tiptapSchemaVersion);
    expect(stored.reason).toBe(SnapshotReason.manual);
  });

  it('keeps a successful persistence when snapshot creation fails', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const yjsState = new Uint8Array([31, 32, 33]);
    const persisted = await repository.replaceYjsState(pageId, yjsState, 0n, 1);

    if (persisted === null) {
      throw new Error('Expected a live page document');
    }

    const captureClient = {
      capture: vi.fn(async () => ({
        storageRevision: persisted.storageRevision,
        tiptapSchemaVersion: persisted.tiptapSchemaVersion,
        yjsState: persisted.yjsState,
      })),
    } as unknown as DocumentCaptureClient;
    const createSnapshotManual = {
      execute: vi.fn(async () => Promise.reject(new Error('insert failed'))),
    };
    const permissions = {
      requireRole: vi.fn(async () => undefined),
    } as unknown as PagePermissionsService;
    const useCase = new CreateCurrentManualSnapshotUseCase(
      permissions,
      captureClient,
      createSnapshotManual as unknown as CreateSnapshotManualUseCase,
    );

    await expect(useCase.execute(pageId, ownerId)).rejects.toThrow('insert failed');

    const current = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    const createdSnapshots = await prisma.documentSnapshot.findMany({ where: { pageId } });
    expect(current.yjsState).toEqual(yjsState);
    expect(current.storageRevision).toBe(persisted.storageRevision);
    expect(createdSnapshots).toEqual([]);
  });
});
