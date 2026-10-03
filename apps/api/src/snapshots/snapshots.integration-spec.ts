import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../database/client';
import type { PrismaService } from '../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../database/transaction';
import { SnapshotReason } from '../generated/prisma/enums';
import { PrismaPagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import { PrismaPagesRepository } from '../pages/pages.repository';
import type { UsersService } from '../users/users.service';
import { PrismaSnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotInternalUseCase } from './use-cases/create-snapshot-internal.use-case';
import { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';
import { SnapshotCreationWorkflow } from './use-cases/snapshot-creation.workflow';

describe('Snapshot use cases and metadata service on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let strangerId: string;
  let projectId: string;
  let transactions: PrismaTransactionRunner;
  let createSnapshotInternal: CreateSnapshotInternalUseCase;
  let createSnapshotManual: CreateSnapshotManualUseCase;
  let snapshots: SnapshotsService;
  const createdPageIds: string[] = [];

  async function createPage(): Promise<string> {
    const pageId = randomUUID();

    await prisma.page.create({
      data: {
        createdById: ownerId,
        id: pageId,
        ownerId,
        position: 'a',
        projectId,
        title: `snapshot-${pageId}`,
      },
    });
    createdPageIds.push(pageId);

    return pageId;
  }

  async function grant(pageId: string, userId: string, role: 'EDITOR' | 'VIEWER'): Promise<void> {
    await prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role, userId },
    });
  }

  function internalInput(pageId: string) {
    return {
      createdById: null,
      pageId,
      reason: SnapshotReason.automatic,
      storageRevision: 7n,
      tiptapSchemaVersion: 4,
      yjsState: new Uint8Array([4, 5, 6]),
    } as const;
  }

  async function createInternal(pageId: string) {
    return createSnapshotInternal.execute(internalInput(pageId));
  }

  function sortedRevisions(revisions: bigint[]): bigint[] {
    return revisions.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    editorId = randomUUID();
    viewerId = randomUUID();
    strangerId = randomUUID();
    projectId = randomUUID();

    await prisma.user.createMany({
      data: [ownerId, editorId, viewerId, strangerId].map((id) => ({
        email: `${id}@snapshots.integration.test`,
        id,
        name: id,
        passwordHash: 'test-hash',
      })),
    });
    await prisma.project.create({ data: { id: projectId, name: 'snapshots', ownerId } });

    const client = prisma as unknown as DatabaseClient;
    const pagesRepository = new PrismaPagesRepository(client);
    const permissionsRepository = new PrismaPagePermissionsRepository(client);
    const snapshotsRepository = new PrismaSnapshotsRepository(client);
    transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    const creation = new SnapshotCreationWorkflow(
      transactions,
      pagesRepository,
      snapshotsRepository,
    );
    createSnapshotInternal = new CreateSnapshotInternalUseCase(creation);
    createSnapshotManual = new CreateSnapshotManualUseCase(permissionsRepository, creation);
    const permissions = new PagePermissionsService(permissionsRepository, {
      findByEmail: async () => null,
    } as unknown as UsersService);
    snapshots = new SnapshotsService(snapshotsRepository, permissions);
  });

  afterEach(async () => {
    await prisma.page.deleteMany({ where: { id: { in: createdPageIds } } });
    createdPageIds.length = 0;
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, editorId, viewerId, strangerId] } },
    });
    await prisma.$disconnect();
  });

  it('concurrent creates on a new page persist consecutive revisions [1n, 2n]', async () => {
    const pageId = await createPage();

    const created = await Promise.all([createInternal(pageId), createInternal(pageId)]);
    const persisted = await prisma.documentSnapshot.findMany({
      orderBy: { revision: 'asc' },
      select: { revision: true },
      where: { pageId },
    });

    expect(created).toHaveLength(2);
    expect(persisted.map((snapshot) => snapshot.revision)).toEqual([1n, 2n]);
    expect(new Set(persisted.map((snapshot) => snapshot.revision)).size).toBe(2);
  });

  it('concurrent creates continue an existing revision sequence from 5n to [6n, 7n]', async () => {
    const pageId = await createPage();
    await prisma.documentSnapshot.create({
      data: {
        createdById: ownerId,
        pageId,
        reason: SnapshotReason.automatic,
        revision: 5n,
        sourceStorageRevision: 5n,
        tiptapSchemaVersion: 1,
        yjsState: new Uint8Array([1]),
      },
    });

    const created = await Promise.all([createInternal(pageId), createInternal(pageId)]);
    const persisted = await prisma.documentSnapshot.findMany({
      orderBy: { revision: 'asc' },
      select: { revision: true },
      where: { pageId },
    });

    expect(created).toHaveLength(2);
    expect(persisted.map((snapshot) => snapshot.revision)).toEqual([5n, 6n, 7n]);
    expect(new Set(persisted.map((snapshot) => snapshot.revision)).size).toBe(3);
  });

  it('keeps page revision sequences independent during concurrent creation', async () => {
    const [firstPageId, secondPageId] = await Promise.all([createPage(), createPage()]);

    await Promise.all([
      createInternal(firstPageId),
      createInternal(firstPageId),
      createInternal(secondPageId),
      createInternal(secondPageId),
    ]);

    const [firstPage, secondPage] = await Promise.all([
      prisma.documentSnapshot.findMany({
        select: { revision: true },
        where: { pageId: firstPageId },
      }),
      prisma.documentSnapshot.findMany({
        select: { revision: true },
        where: { pageId: secondPageId },
      }),
    ]);

    expect(sortedRevisions(firstPage.map((snapshot) => snapshot.revision))).toEqual([1n, 2n]);
    expect(sortedRevisions(secondPage.map((snapshot) => snapshot.revision))).toEqual([1n, 2n]);
  });

  it('rolls back a snapshot created through an outer transaction scope', async () => {
    const pageId = await createPage();
    let createdSnapshotId: string | undefined;

    await expect(
      transactions.run(async (scope) => {
        const created = await createSnapshotInternal.execute(internalInput(pageId), scope);
        createdSnapshotId = created.id;
        throw new Error('outer transaction failed');
      }),
    ).rejects.toThrow('outer transaction failed');

    if (createdSnapshotId === undefined) {
      throw new Error('The snapshot was not created inside the outer transaction');
    }

    await expect(
      prisma.documentSnapshot.findUnique({ where: { id: createdSnapshotId } }),
    ).resolves.toBeNull();
  });

  it('allows owner, editor, and viewer to read page metadata without Yjs state', async () => {
    const pageId = await createPage();
    await grant(pageId, editorId, 'EDITOR');
    await grant(pageId, viewerId, 'VIEWER');
    const created = await createInternal(pageId);

    for (const actorId of [ownerId, editorId, viewerId]) {
      const listed = await snapshots.listMetadata(pageId, actorId);
      const fetched = await snapshots.getMetadata(pageId, created.id, actorId);

      expect(listed[0]).toMatchObject({ id: created.id, revision: 1n });
      expect(fetched).toMatchObject({ id: created.id, revision: 1n });
      expect(listed[0]).not.toHaveProperty('yjsState');
      expect(fetched).not.toHaveProperty('yjsState');
    }
  });

  it('preserves safe not-found semantics for inaccessible pages and cross-page snapshot ids', async () => {
    const [firstPageId, secondPageId] = await Promise.all([createPage(), createPage()]);
    const created = await createInternal(firstPageId);

    await expect(snapshots.listMetadata(firstPageId, strangerId)).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
    await expect(snapshots.listMetadata(randomUUID(), ownerId)).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
    await expect(snapshots.getMetadata(secondPageId, created.id, ownerId)).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });

  it('enforces manual creation permissions and preserves captured metadata', async () => {
    const pageId = await createPage();
    await grant(pageId, editorId, 'EDITOR');
    await grant(pageId, viewerId, 'VIEWER');
    const state = new Uint8Array([8, 9]);

    const ownerSnapshot = await createSnapshotManual.execute({
      createdById: ownerId,
      pageId,
      storageRevision: 11n,
      tiptapSchemaVersion: 6,
      yjsState: state,
    });
    const editorSnapshot = await createSnapshotManual.execute({
      createdById: editorId,
      pageId,
      storageRevision: 12n,
      tiptapSchemaVersion: 7,
      yjsState: state,
    });

    expect(ownerSnapshot).toMatchObject({
      createdBy: { id: ownerId },
      reason: SnapshotReason.manual,
      sourceStorageRevision: 11n,
      tiptapSchemaVersion: 6,
    });
    expect(editorSnapshot).toMatchObject({
      createdBy: { id: editorId },
      reason: SnapshotReason.manual,
      sourceStorageRevision: 12n,
      tiptapSchemaVersion: 7,
    });
    await expect(
      createSnapshotManual.execute({
        createdById: viewerId,
        pageId,
        storageRevision: 13n,
        tiptapSchemaVersion: 7,
        yjsState: state,
      }),
    ).rejects.toBeInstanceOf(PageRoleInsufficientError);
    await expect(
      createSnapshotManual.execute({
        createdById: strangerId,
        pageId,
        storageRevision: 13n,
        tiptapSchemaVersion: 7,
        yjsState: state,
      }),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });
});
