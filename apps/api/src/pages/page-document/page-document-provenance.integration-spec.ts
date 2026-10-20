import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { AssetGcUseCases } from '../../assets/asset-gc.use-cases';
import { AssetUploadUseCases } from '../../assets/asset-upload.use-cases';
import { AssetsUseCases } from '../../assets/assets.use-cases';
import { FilesystemObjectStorage } from '../../assets/storage/filesystem-object-storage';
import type { ApplicationConfig } from '../../config/application-config';
import { createPrismaClient, type PrismaClient } from '../../database/client';
import type { PrismaService } from '../../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../../database/transaction';
import type { DocumentCaptureClient } from '../../document-capture/document-capture.client';
import { Prisma } from '../../generated/prisma/client';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PrismaPagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../../page-permissions/page-permissions.service';
import { PrismaSnapshotsRepository } from '../../snapshots/snapshots.repository';
import { CreateCurrentManualSnapshotUseCase } from '../../snapshots/use-cases/create-current-manual-snapshot.use-case';
import { CreateSnapshotManualUseCase } from '../../snapshots/use-cases/create-snapshot-manual.use-case';
import { PrismaPagesRepository } from '../pages.repository';
import { PrismaPageDocumentRepository } from './page-document.repository';
import { ProjectionRetryScheduler } from './projection-retry.scheduler';
import { ProjectPageAssetsUseCase } from './use-cases/project-page-assets.use-case';

describe('PageDocument provenance on PostgreSQL', () => {
  let prisma: PrismaClient;
  let storage: FilesystemObjectStorage;
  let storageDirectory: string;
  let ownerId: string;
  let projectId: string;
  const pageIds: string[] = [];
  const assetIds: string[] = [];
  const additionalUserIds: string[] = [];

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
      if (additionalUserIds.length > 0)
        await prisma.user.deleteMany({ where: { id: { in: additionalUserIds } } });
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

  it('rejects a pending-to-ready transition without required storage metadata', async () => {
    const asset = await prisma.asset.create({
      data: {
        id: randomUUID(),
        originalName: 'incomplete.png',
        storageKey: `assets/${randomUUID()}/${randomUUID()}`,
        uploadedById: ownerId,
      },
    });
    assetIds.push(asset.id);

    await expect(
      prisma.asset.update({ where: { id: asset.id }, data: { status: 'ready' } }),
    ).rejects.toMatchObject({ code: 'P2039' });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe(
      'pending',
    );
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

  it('rebuilds a migration-style missing watermark and keeps page upload closed until then', async () => {
    const pageId = await createPage();
    await prisma.pageAssetProjection.update({
      where: { pageId },
      data: { sourceStorageRevision: null },
    });
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
    const uploads = new AssetUploadUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    await expect(uploads.initiate(ownerId, pageId, 'before-rebuild.png')).rejects.toMatchObject({
      status: 503,
    });

    const scheduler = new ProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      new ProjectPageAssetsUseCase(prisma as unknown as PrismaService),
    );
    await scheduler.retryStaleProjections();

    const [document, projection] = await Promise.all([
      prisma.pageDocument.findUniqueOrThrow({
        where: { pageId },
        select: { storageRevision: true },
      }),
      prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } }),
    ]);
    expect(projection.sourceStorageRevision).toBe(document.storageRevision);
    const initiated = await uploads.initiate(ownerId, pageId, 'after-rebuild.png');
    assetIds.push(initiated.assetId);
  });

  it('recovers a transient projection failure without another document write', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const committed = await repository.replaceYjsState(pageId, new Uint8Array(), 0n, 1);
    if (!committed) throw new Error('Expected the document write to commit');
    const projection = new ProjectPageAssetsUseCase(prisma as unknown as PrismaService);
    const transaction = vi.spyOn(prisma, '$transaction');
    transaction.mockRejectedValueOnce(new Error('temporary projection transaction failure'));
    await projection.execute(committed);
    transaction.mockRestore();

    await prisma.pageAssetProjection.update({
      where: { pageId },
      data: { retryAfter: new Date(0) },
    });
    const scheduler = new ProjectionRetryScheduler(prisma as unknown as PrismaService, projection);
    await scheduler.retryStaleProjections();

    const [document, watermark] = await Promise.all([
      prisma.pageDocument.findUniqueOrThrow({ where: { pageId } }),
      prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } }),
    ]);
    expect(document.storageRevision).toBe(committed?.storageRevision);
    expect(watermark.sourceStorageRevision).toBe(document.storageRevision);
    expect(watermark.lastErrorCode).toBeNull();
  });

  it('fails closed for a viewer during projection lag and allows reading after the scheduler converges', async () => {
    const pageId = await createPage();
    const viewerId = randomUUID();
    additionalUserIds.push(viewerId);
    await prisma.user.create({
      data: {
        email: `${viewerId}@document-provenance.integration.test`,
        id: viewerId,
        name: viewerId,
        passwordHash: 'test-hash',
      },
    });
    await prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role: 'VIEWER', userId: viewerId },
    });

    const assetId = randomUUID();
    const storageKey = `assets/${assetId}/${randomUUID()}`;
    assetIds.push(assetId);
    await prisma.asset.create({
      data: {
        id: assetId,
        checksum: 'projection-lag-checksum',
        mimeType: 'image/png',
        originalName: 'projection.png',
        sizeBytes: 8n,
        status: 'ready',
        storageKey,
        uploadedById: ownerId,
      },
    });
    await prisma.pageAssetGrant.create({ data: { assetId, pageId } });
    await storage.putObject(storageKey, {
      body: Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
      checksum: 'projection-smoke-checksum',
      contentLength: 8,
      contentType: 'image/png',
    });

    const ydoc = new Y.Doc();
    const image = new Y.XmlElement('image');
    image.setAttribute('nodeId', randomUUID());
    image.setAttribute('source', { type: 'asset', assetId } as unknown as string);
    image.setAttribute('alt', 'Diagram');
    image.setAttribute('decorative', false as unknown as string);
    image.setAttribute('alignment', 'center');
    image.setAttribute('widthPercent', 100 as unknown as string);
    ydoc.getXmlFragment('default').insert(0, [image]);
    const state = Uint8Array.from(Y.encodeStateAsUpdate(ydoc));
    ydoc.destroy();
    const committed = await new PrismaPageDocumentRepository(
      prisma as unknown as DatabaseClient,
    ).replaceYjsState(pageId, state, 0n, 2);
    if (!committed) throw new Error('Expected the asset document write to commit');

    const permissions = new PagePermissionsService(
      new PrismaPagePermissionsRepository(prisma as unknown as DatabaseClient),
    );
    const config = { assets: { readUrlTtlSeconds: 60 } } as unknown as ApplicationConfig;
    const assets = new AssetsUseCases(
      prisma as unknown as PrismaService,
      permissions,
      storage,
      config,
    );

    await expect(assets.readUrlForPage(viewerId, assetId, pageId)).rejects.toMatchObject({
      status: 401,
    });
    expect(await prisma.pageAsset.count({ where: { pageId, assetId } })).toBe(0);

    await new ProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      new ProjectPageAssetsUseCase(prisma as unknown as PrismaService),
    ).retryStaleProjections();

    await expect(assets.readUrlForPage(viewerId, assetId, pageId)).resolves.toMatchObject({
      url: expect.any(String),
      expiresInSeconds: 60,
    });
    expect(await prisma.pageAsset.count({ where: { pageId, assetId } })).toBe(1);
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
    const uploads = new AssetUploadUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const initiated = await uploads.initiate(ownerId, pageId, 'cover.png');
    assetIds.push(initiated.assetId);
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=',
      'base64',
    );
    const request = Readable.from([bytes]) as Readable & Request;
    request.headers = { 'content-length': String(bytes.length), 'content-type': 'image/png' };

    const uploaded = await uploads.upload(ownerId, initiated.assetId, request);
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

  it('retries a new document revision after the previous revision exhausted its attempts', async () => {
    const pageId = await createPage();
    const previousRevision = 0n;
    await prisma.pageAssetProjection.update({
      where: { pageId },
      data: {
        attemptedStorageRevision: previousRevision,
        attemptCount: 5,
        lastErrorCode: 'retry_exhausted',
        retryAfter: null,
      },
    });
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const committed = await repository.replaceYjsState(pageId, new Uint8Array(), 0n, 1);
    expect(committed?.storageRevision).toBe(1n);
    // The synchronous projection did not run for this write; the old watermark remains.
    expect(
      (await prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } }))
        .sourceStorageRevision,
    ).toBe(previousRevision);

    const projection = new ProjectPageAssetsUseCase(prisma as unknown as PrismaService);
    const scheduler = new ProjectionRetryScheduler(prisma as unknown as PrismaService, projection);
    await scheduler.retryStaleProjections();

    const watermark = await prisma.pageAssetProjection.findUniqueOrThrow({ where: { pageId } });
    expect(watermark.sourceStorageRevision).toBe(committed?.storageRevision);
    expect(watermark.attemptedStorageRevision).toBe(committed?.storageRevision);
    expect(watermark.attemptCount).toBe(0);
    expect(watermark.lastErrorCode).toBeNull();
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
    const uploads = new AssetUploadUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const initiated = await uploads.initiate(ownerId, undefined, 'ambiguous.png');
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

    await expect(uploads.upload(ownerId, initiated.assetId, request)).rejects.toThrow(
      'simulated lost PostgreSQL response after commit',
    );

    const stored = await prisma.asset.findUniqueOrThrow({ where: { id: initiated.assetId } });
    expect(stored.status).toBe('ready');
    expect(await storage.headObject(stored.storageKey)).not.toBeNull();
    expect(deleteObject).not.toHaveBeenCalled();
    updateMany.mockRestore();
  });

  it('does not expire an asset that becomes ready while cleanup waits for its row lock', async () => {
    const storageKey = `assets/${randomUUID()}/${randomUUID()}`;
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const asset = await prisma.asset.create({
      data: {
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        id: randomUUID(),
        originalName: 'pending.png',
        storageKey,
        uploadedById: ownerId,
      },
    });
    assetIds.push(asset.id);
    await storage.putObject(storageKey, {
      body: Readable.from([bytes]),
      checksum: 'pending-checksum',
      contentLength: bytes.length,
      contentType: 'image/png',
    });
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
    const assets = new AssetGcUseCases(prisma as unknown as PrismaService, storage, config);
    const candidateRead = deferred();
    const originalFindMany = prisma.asset.findMany.bind(prisma.asset);
    const candidateQuery = vi.spyOn(prisma.asset, 'findMany').mockImplementation((async (
      args: Parameters<typeof prisma.asset.findMany>[0],
    ) => {
      const result = await originalFindMany(args);
      if (args?.where?.createdAt !== undefined) candidateRead.resolve();
      return result;
    }) as never);

    const lockHeld = deferred();
    const releaseLock = deferred();
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${asset.id}::uuid FOR UPDATE`;
      lockHeld.resolve();
      await releaseLock.promise;
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          checksum: 'ready-checksum',
          mimeType: 'image/png',
          sizeBytes: BigInt(bytes.length),
          status: 'ready',
        },
      });
    });
    await lockHeld.promise;
    const cleanup = assets.cleanupExpiredPendingAssets();
    await candidateRead.promise;
    releaseLock.resolve();
    await Promise.all([blocker, cleanup]);

    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe(
      'ready',
    );
    expect(await storage.headObject(storageKey)).not.toBeNull();
    candidateQuery.mockRestore();
  });

  it('cleans an expired pending asset only after committing its tombstone', async () => {
    const storageKey = `assets/${randomUUID()}/${randomUUID()}`;
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const asset = await prisma.asset.create({
      data: {
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        id: randomUUID(),
        originalName: 'expired.png',
        storageKey,
        uploadedById: ownerId,
      },
    });
    assetIds.push(asset.id);
    await storage.putObject(storageKey, {
      body: Readable.from([bytes]),
      checksum: 'expired-checksum',
      contentLength: bytes.length,
      contentType: 'image/png',
    });
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

    await new AssetGcUseCases(
      prisma as unknown as PrismaService,
      storage,
      config,
    ).cleanupExpiredPendingAssets();

    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).status).toBe(
      'deleted',
    );
    expect(await storage.headObject(storageKey)).toBeNull();
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
    const references = new AssetsUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const assets = new AssetGcUseCases(prisma as unknown as PrismaService, storage, config);
    const uploads = new AssetUploadUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const upload = async (contextPageId?: string) => {
      const initiated = await uploads.initiate(ownerId, contextPageId, 'retained.png');
      assetIds.push(initiated.assetId);
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const request = Readable.from([bytes]) as Readable & Request;
      request.headers = { 'content-length': String(bytes.length), 'content-type': 'image/png' };
      await uploads.upload(ownerId, initiated.assetId, request);
      return initiated.assetId;
    };

    const pageAssetId = await upload(pageId);
    await references.setCover(ownerId, pageId, pageAssetId);
    await expect(assets.delete(ownerId, pageAssetId)).rejects.toThrow('Asset is still in use');
    await references.setCover(ownerId, pageId, null);
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
    await references.setAvatar(ownerId, avatarAssetId);
    await expect(assets.delete(ownerId, avatarAssetId)).rejects.toThrow('Asset is still in use');
    await references.setAvatar(ownerId, null);
    await assets.delete(ownerId, avatarAssetId);
    await assets.delete(ownerId, avatarAssetId);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: avatarAssetId } })).status).toBe(
      'deleted',
    );

    const racingAssetId = await upload(pageId);
    const [coverResult] = await Promise.allSettled([
      references.setCover(ownerId, pageId, racingAssetId),
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

  it('restarts asset GC in a new transaction when its page grant set changes', async () => {
    const firstPageId = await createPage();
    const secondPageId = await createPage();
    const assetId = randomUUID();
    const storageKey = `assets/${assetId}/${randomUUID()}`;
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const asset = await prisma.asset.create({
      data: {
        checksum: 'gc-checksum',
        id: assetId,
        mimeType: 'image/png',
        originalName: 'gc.png',
        sizeBytes: BigInt(bytes.length),
        status: 'ready',
        storageKey,
        uploadedById: ownerId,
      },
    });
    assetIds.push(asset.id);
    await prisma.pageAssetGrant.create({ data: { pageId: firstPageId, assetId } });
    await storage.putObject(storageKey, {
      body: Readable.from([bytes]),
      checksum: 'gc-checksum',
      contentLength: bytes.length,
      contentType: 'image/png',
    });
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
    const assets = new AssetGcUseCases(prisma as unknown as PrismaService, storage, config);
    const references = new AssetsUseCases(
      prisma as unknown as PrismaService,
      { requireRole: vi.fn(async () => 'owner') } as never,
      storage,
      config,
    );
    const reachedAssetLock = deferred();
    const resumeDeletion = deferred();
    let interceptDeletion = true;
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transactions = vi.spyOn(prisma, '$transaction');
    transactions.mockImplementation(((
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      originalTransaction(async (tx) => {
        if (!interceptDeletion) return operation(tx);
        interceptDeletion = false;
        const pausedTransaction = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === '$queryRaw') {
              return async <T>(query: TemplateStringsArray, ...values: unknown[]) => {
                if (!reachedAssetLockResolved && query.join('').includes('FROM "Asset"')) {
                  reachedAssetLockResolved = true;
                  reachedAssetLock.resolve();
                  await resumeDeletion.promise;
                }
                return Reflect.apply(Reflect.get(target, property, target), target, [
                  query,
                  ...values,
                ]) as Promise<T>;
              };
            }
            return Reflect.get(target, property, receiver);
          },
        });
        return operation(pausedTransaction);
      })) as never);

    let reachedAssetLockResolved = false;
    const deletion = assets.delete(ownerId, assetId);
    await reachedAssetLock.promise;
    await references.grant(ownerId, secondPageId, assetId);
    resumeDeletion.resolve();
    await deletion;

    const storedAsset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(storedAsset.status).toBe('deleted');
    expect(await prisma.pageAssetGrant.count({ where: { assetId } })).toBe(0);
    expect(await storage.headObject(storageKey)).toBeNull();
    expect(transactions).toHaveBeenCalledTimes(3);
    transactions.mockRestore();
  });

  it('defers a stale granted asset and warns only after the configured age', async () => {
    const pageId = await createPage();
    const staleAssetId = randomUUID();
    const staleKey = `assets/${staleAssetId}/${randomUUID()}`;
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const staleAsset = await prisma.asset.create({
      data: {
        checksum: 'stale-gc-checksum',
        id: staleAssetId,
        mimeType: 'image/png',
        originalName: 'stale.png',
        sizeBytes: BigInt(bytes.length),
        status: 'ready',
        storageKey: staleKey,
        uploadedById: ownerId,
      },
    });
    assetIds.push(staleAsset.id);
    await prisma.pageAssetGrant.create({ data: { pageId, assetId: staleAssetId } });
    await new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient).replaceYjsState(
      pageId,
      new Uint8Array(),
      0n,
      1,
    );
    await storage.putObject(staleKey, {
      body: Readable.from([bytes]),
      checksum: 'stale-gc-checksum',
      contentLength: bytes.length,
      contentType: 'image/png',
    });

    const warning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const config = {
      assets: {
        gcBatchSize: 25,
        gcEnabled: false,
        gcIntervalSeconds: 60,
        maxConcurrentUploads: 2,
        maxUploadBytes: 10 * 1024 * 1024,
        orphanGraceHours: 24,
        pendingTtlHours: 24,
        projectionStaleWarningSeconds: 60,
        readUrlTtlSeconds: 60,
        s3RequestTimeoutMs: 15_000,
        uploadTimeoutMs: 120_000,
        s3: null,
      },
    } as unknown as ApplicationConfig;
    const gc = new AssetGcUseCases(prisma as unknown as PrismaService, storage, config);

    await expect(gc.delete(ownerId, staleAssetId)).rejects.toThrow('projection is stale');
    expect(warning).not.toHaveBeenCalled();
    await prisma.$executeRaw`UPDATE "PageDocument" SET "updatedAt" = NOW() - INTERVAL '10 minutes' WHERE "pageId" = ${pageId}::uuid`;
    await expect(gc.delete(ownerId, staleAssetId)).rejects.toThrow('projection is stale');

    expect((await prisma.asset.findUniqueOrThrow({ where: { id: staleAssetId } })).status).toBe(
      'ready',
    );
    expect(await storage.headObject(staleKey)).not.toBeNull();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(pageId));
    warning.mockRestore();
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
    const permissions = new PagePermissionsService(permissionsRepository);
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
