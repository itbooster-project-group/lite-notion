import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../database/client';
import { PrismaService } from '../database/prisma.service';
import { PrismaTransactionRunner } from '../database/transaction';
import { SnapshotReason } from '../generated/prisma/enums';
import { PrismaPublicationsRepository } from './publications.repository';

describe('publication database invariants on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let projectId: string;
  const pageIds: string[] = [];
  const revalidationIds: string[] = [];
  const assetIds: string[] = [];
  let transactions: PrismaTransactionRunner;
  let publications: PrismaPublicationsRepository;

  async function createPage(title: string): Promise<string> {
    const id = randomUUID();
    await prisma.page.create({
      data: {
        createdById: ownerId,
        id,
        ownerId,
        position: 'a',
        projectId,
        title,
      },
    });
    pageIds.push(id);
    return id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    publications = new PrismaPublicationsRepository(prisma);
    ownerId = randomUUID();
    projectId = randomUUID();
    await prisma.user.create({
      data: {
        email: `${ownerId}@publications.integration.test`,
        id: ownerId,
        name: ownerId,
        passwordHash: 'test-hash',
      },
    });
    await prisma.project.create({ data: { id: projectId, name: 'publication schema', ownerId } });
  });

  afterEach(async () => {
    await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
    pageIds.length = 0;
    await prisma.publicationRevalidation.deleteMany({ where: { id: { in: revalidationIds } } });
    revalidationIds.length = 0;
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    assetIds.length = 0;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('enforces globally unique slug and publication row shape', async () => {
    const [firstPageId, secondPageId] = await Promise.all([
      createPage('first publication'),
      createPage('second publication'),
    ]);
    await prisma.pagePublication.create({ data: { pageId: firstPageId, slug: 'shared-slug' } });

    await expect(
      prisma.pagePublication.create({ data: { pageId: secondPageId, slug: 'shared-slug' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.pagePublication.create({
        data: { pageId: secondPageId, slug: 'invalid-published-shape', status: 'published' },
      }),
    ).rejects.toThrow();
  });

  it('enforces same-page snapshot FK', async () => {
    const [snapshotPageId, publicationPageId] = await Promise.all([
      createPage('snapshot owner'),
      createPage('publication owner'),
    ]);
    const snapshot = await prisma.documentSnapshot.create({
      data: {
        pageId: snapshotPageId,
        reason: SnapshotReason.publication,
        revision: 1n,
        sourceStorageRevision: 3n,
        tiptapSchemaVersion: 2,
        yjsState: new Uint8Array([1]),
      },
    });

    await expect(
      prisma.pagePublication.create({
        data: {
          pageId: publicationPageId,
          publishedAt: new Date(),
          slug: 'wrong-page-snapshot',
          snapshotId: snapshot.id,
          status: 'published',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('restricts asset deletion while rendering or snapshot refs retain it', async () => {
    const pageId = await createPage('asset retention');
    const assetId = randomUUID();
    assetIds.push(assetId);
    await prisma.asset.create({
      data: {
        checksum: 'a'.repeat(64),
        id: assetId,
        mimeType: 'image/png',
        originalName: 'cover.png',
        sizeBytes: 1n,
        status: 'ready',
        storageKey: `assets/${assetId}`,
        uploadedById: ownerId,
      },
    });
    const snapshot = await prisma.documentSnapshot.create({
      data: {
        pageId,
        reason: SnapshotReason.publication,
        revision: 1n,
        sourceStorageRevision: 0n,
        tiptapSchemaVersion: 2,
        yjsState: new Uint8Array([1]),
      },
    });
    await prisma.documentRendering.create({
      data: {
        contentJson: { type: 'doc' },
        coverAssetId: assetId,
        pageTitle: 'asset retention',
        snapshotId: snapshot.id,
        tiptapSchemaVersion: 2,
      },
    });
    await prisma.snapshotAsset.create({
      data: { assetId, nodeId: 'image-node', snapshotId: snapshot.id },
    });

    await expect(prisma.asset.delete({ where: { id: assetId } })).rejects.toThrow();
  });

  it('keeps pending route invalidation across hard page deletion', async () => {
    const pageId = await createPage('purged publication');
    const event = await prisma.publicationRevalidation.create({
      data: { paths: [`/p/${pageId}`] },
    });
    revalidationIds.push(event.id);
    await prisma.page.delete({ where: { id: pageId } });
    pageIds.splice(pageIds.indexOf(pageId), 1);

    await expect(
      prisma.publicationRevalidation.findUnique({ where: { id: event.id } }),
    ).resolves.toMatchObject({ paths: [`/p/${pageId}`] });
  });

  it('claims an outbox event once across concurrent workers and rejects a late lease token', async () => {
    await prisma.publicationRevalidation.updateMany({
      data: { deliveredAt: new Date(), leaseToken: null, leaseUntil: null },
      where: { deliveredAt: null },
    });
    const event = await prisma.publicationRevalidation.create({
      data: { paths: ['/p/lease-test'] },
    });
    revalidationIds.push(event.id);
    const now = new Date();
    const [first, second] = await Promise.all([
      transactions.run(
        (scope) =>
          publications
            .bind(scope)
            .claimRevalidation(now, randomUUID(), new Date(now.getTime() + 30_000)),
        { maxWaitMs: 500, timeoutMs: 1_000 },
      ),
      transactions.run(
        (scope) =>
          publications
            .bind(scope)
            .claimRevalidation(now, randomUUID(), new Date(now.getTime() + 30_000)),
        { maxWaitMs: 500, timeoutMs: 1_000 },
      ),
    ]);
    const activeLease = first ?? second;
    expect(activeLease).not.toBeNull();
    expect([first, second].filter(Boolean)).toHaveLength(1);
    if (!activeLease) throw new Error('Expected one claimed event');

    await prisma.publicationRevalidation.update({
      data: { leaseUntil: new Date(Date.now() - 1) },
      where: { id: event.id },
    });
    const replacement = await transactions.run((scope) =>
      publications
        .bind(scope)
        .claimRevalidation(new Date(), randomUUID(), new Date(Date.now() + 30_000)),
    );
    expect(replacement).not.toBeNull();
    if (!replacement) throw new Error('Expected expired lease to be reclaimed');

    await expect(
      transactions.run((scope) =>
        publications
          .bind(scope)
          .acknowledgeRevalidation(event.id, activeLease.leaseToken, new Date()),
      ),
    ).resolves.toBe(false);
    await expect(
      transactions.run((scope) =>
        publications
          .bind(scope)
          .acknowledgeRevalidation(event.id, replacement.leaseToken, new Date()),
      ),
    ).resolves.toBe(true);
  });
});
