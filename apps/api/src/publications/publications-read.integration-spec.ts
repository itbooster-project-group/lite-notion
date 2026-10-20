import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssetGcUseCases } from '../assets/asset-gc.use-cases';
import type { ObjectStorage } from '../assets/storage/object-storage';
import type { ApplicationConfig } from '../config/application-config';
import { createPrismaClient, type PrismaClient } from '../database/client';
import type { PrismaService } from '../database/prisma.service';
import { SnapshotReason } from '../generated/prisma/enums';
import { PrismaPagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import { PublicationNotFoundError } from './publication-errors';
import { PublicationManagementService } from './publication-management.service';
import { PublicationsReadService } from './publications-read.service';

describe('public publication read and asset resolver on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let viewerId: string;
  let projectId: string;
  let pageId: string;
  let service: PublicationsReadService;
  let management: PublicationManagementService;
  let storage: ObjectStorage;
  let assetGc: AssetGcUseCases;
  const assetIds: string[] = [];
  const snapshotIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5_000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    viewerId = randomUUID();
    projectId = randomUUID();
    await prisma.user.createMany({
      data: [ownerId, viewerId].map((id) => ({
        email: `${id}@publication-read.integration.test`,
        id,
        name: id,
        passwordHash: 'test-hash',
      })),
    });
    await prisma.project.create({
      data: { id: projectId, name: 'public publication read', ownerId },
    });
    const storageMock = {
      deleteObject: vi.fn(async () => undefined),
      signedReadUrl: vi.fn(async () => 'https://private-storage.example/signed?sig=secret'),
    };
    storage = storageMock as unknown as ObjectStorage;
    service = new PublicationsReadService(prisma as unknown as PrismaService, storage);
    management = new PublicationManagementService(
      new PagePermissionsService(
        new PrismaPagePermissionsRepository(prisma as unknown as PrismaService),
      ),
      service,
    );
    assetGc = new AssetGcUseCases(prisma as unknown as PrismaService, storage, {
      assets: { projectionStaleWarningSeconds: 300 },
    } as ApplicationConfig);
  });

  afterEach(async () => {
    if (pageId) await prisma.page.deleteMany({ where: { id: pageId } });
    pageId = '';
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    assetIds.length = 0;
    snapshotIds.length = 0;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } });
    await prisma.$disconnect();
  });

  async function createAsset(name: string): Promise<string> {
    const id = randomUUID();
    assetIds.push(id);
    await prisma.asset.create({
      data: {
        checksum: 'c'.repeat(64),
        id,
        mimeType: 'image/png',
        originalName: name,
        sizeBytes: 1n,
        status: 'ready',
        storageKey: `assets/${id}`,
        uploadedById: ownerId,
        width: 640,
        height: 480,
      },
    });
    return id;
  }

  it('exposes only the current snapshot assets and returns uniform not-found after unpublish or deletion', async () => {
    pageId = randomUUID();
    await prisma.page.create({
      data: {
        createdById: ownerId,
        id: pageId,
        ownerId,
        position: 'a',
        projectId,
        title: 'private live title',
      },
    });
    await prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role: 'VIEWER', userId: viewerId },
    });
    await expect(management.get(ownerId, pageId)).rejects.toBeInstanceOf(PublicationNotFoundError);
    await expect(management.get(viewerId, pageId)).rejects.toBeInstanceOf(
      PageRoleInsufficientError,
    );
    const previousAssetId = await createAsset('previous.png');
    const currentAssetId = await createAsset('current.png');
    const unrelatedAssetId = await createAsset('unrelated.png');
    const previousSnapshot = await prisma.documentSnapshot.create({
      data: {
        pageId,
        reason: SnapshotReason.publication,
        revision: 1n,
        sourceStorageRevision: 5n,
        tiptapSchemaVersion: 2,
        yjsState: new Uint8Array([1]),
      },
    });
    snapshotIds.push(previousSnapshot.id);
    await prisma.documentRendering.create({
      data: {
        contentJson: {
          type: 'doc',
          content: [
            { type: 'image', attrs: { source: { type: 'asset', assetId: previousAssetId } } },
          ],
        },
        pageTitle: 'old title',
        snapshotId: previousSnapshot.id,
        tiptapSchemaVersion: 2,
      },
    });
    await prisma.snapshotAsset.create({
      data: { assetId: previousAssetId, nodeId: 'old-image-node', snapshotId: previousSnapshot.id },
    });

    const currentSnapshot = await prisma.documentSnapshot.create({
      data: {
        pageId,
        reason: SnapshotReason.publication,
        revision: 2n,
        sourceStorageRevision: 6n,
        tiptapSchemaVersion: 2,
        yjsState: new Uint8Array([2]),
      },
    });
    snapshotIds.push(currentSnapshot.id);
    await prisma.documentRendering.create({
      data: {
        contentJson: {
          type: 'doc',
          content: [
            { type: 'image', attrs: { source: { type: 'asset', assetId: currentAssetId } } },
          ],
        },
        coverAssetId: currentAssetId,
        pageTitle: 'published immutable title',
        snapshotId: currentSnapshot.id,
        tiptapSchemaVersion: 2,
      },
    });
    await prisma.snapshotAsset.create({
      data: {
        assetId: currentAssetId,
        nodeId: 'current-image-node',
        snapshotId: currentSnapshot.id,
      },
    });
    await prisma.pagePublication.create({
      data: {
        pageId,
        publishedAt: new Date(),
        seoTitle: 'Public SEO title',
        slug: 'public-read-test',
        snapshotId: currentSnapshot.id,
        status: 'published',
      },
    });
    await expect(management.get(ownerId, pageId)).resolves.toMatchObject({
      status: 'published',
      slug: 'public-read-test',
      seoTitle: 'Public SEO title',
      publicPath: '/p/public-read-test',
    });

    const publicView = await service.getPublic('public-read-test');
    expect(publicView).toMatchObject({
      title: 'published immutable title',
      seoTitle: 'Public SEO title',
      schemaVersion: 2,
      assets: [
        {
          assetId: currentAssetId,
          resolverPath: `/api/v1/public/publications/public-read-test/assets/${currentAssetId}`,
        },
      ],
      cover: { assetId: currentAssetId },
    });
    expect(Object.keys(publicView ?? {}).sort()).toEqual([
      'assets',
      'contentJson',
      'cover',
      'schemaVersion',
      'seoDescription',
      'seoTitle',
      'title',
    ]);
    expect(JSON.stringify(publicView)).not.toContain('storageKey');
    expect(await service.resolveAsset('public-read-test', currentAssetId)).toContain(
      'signed?sig=secret',
    );
    await expect(service.resolveAsset('public-read-test', previousAssetId)).resolves.toBeNull();
    await expect(service.resolveAsset('public-read-test', unrelatedAssetId)).resolves.toBeNull();
    await expect(assetGc.delete(ownerId, currentAssetId)).rejects.toBeInstanceOf(ConflictException);
    await expect(prisma.asset.findUnique({ where: { id: currentAssetId } })).resolves.toMatchObject(
      {
        status: 'ready',
      },
    );
    await assetGc.delete(ownerId, previousAssetId);
    await expect(
      prisma.asset.findUnique({ where: { id: previousAssetId } }),
    ).resolves.toMatchObject({
      status: 'deleted',
    });

    await prisma.pagePublication.update({ data: { status: 'unpublished' }, where: { pageId } });
    await expect(service.getPublic('public-read-test')).resolves.toBeNull();
    await expect(service.resolveAsset('public-read-test', currentAssetId)).resolves.toBeNull();
    await assetGc.delete(ownerId, currentAssetId);

    await prisma.pagePublication.update({ data: { status: 'published' }, where: { pageId } });
    await prisma.page.update({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: pageId },
    });
    await expect(management.get(ownerId, pageId)).rejects.toBeInstanceOf(PageNotFoundError);
    await expect(service.getPublic('public-read-test')).resolves.toBeNull();
    await expect(service.resolveAsset('public-read-test', currentAssetId)).resolves.toBeNull();

    await prisma.page.update({
      data: { deletedAt: null, deletedOrigin: null },
      where: { id: pageId },
    });
    await prisma.project.update({ data: { deletedAt: new Date() }, where: { id: projectId } });
    await expect(management.get(ownerId, pageId)).rejects.toBeInstanceOf(PageNotFoundError);
    await expect(service.getPublic('public-read-test')).resolves.toBeNull();
    await expect(service.resolveAsset('public-read-test', currentAssetId)).resolves.toBeNull();
    await expect(service.getPublic('missing-slug')).resolves.toBeNull();
  });
});
