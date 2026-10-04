import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPrismaClient, type PrismaClient } from '../../database/client';
import type { PrismaService } from '../../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../../database/transaction';
import { SnapshotReason } from '../../generated/prisma/enums';
import { PrismaPagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../../page-permissions/page-permissions.service';
import type { DocumentCaptureClient } from '../../snapshots/document-capture.client';
import { SnapshotApplicationService } from '../../snapshots/snapshot-application.service';
import { PrismaSnapshotsRepository } from '../../snapshots/snapshots.repository';
import { CreateSnapshotManualUseCase } from '../../snapshots/use-cases/create-snapshot-manual.use-case';
import type { UsersService } from '../../users/users.service';
import { PrismaPagesRepository } from '../pages.repository';
import { PrismaPageDocumentRepository } from './page-document.repository';

describe('PageDocument provenance on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let projectId: string;
  const pageIds: string[] = [];

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
        document: { create: { tiptapSchemaVersion: 4, yjsState: new Uint8Array() } },
      },
    });
    pageIds.push(pageId);

    return pageId;
  }

  beforeAll(async () => {
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
    if (pageIds.length > 0) {
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
    }
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it('returns the exact bytes and revision from each concurrent persisted write', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const writes = [new Uint8Array([1, 2, 3]), new Uint8Array([9, 8, 7])];

    const records = await Promise.all(
      writes.map((yjsState) => repository.replaceYjsState(pageId, yjsState)),
    );

    expect(records).not.toContain(null);
    const persistedRecords = records.filter((record) => record !== null);
    expect(persistedRecords.map((record) => record.storageRevision).sort()).toEqual([1n, 2n]);

    for (const record of persistedRecords) {
      const correspondingWrite = writes.find((state) =>
        state.every((byte, index) => byte === record.yjsState[index]),
      );
      expect(correspondingWrite).toEqual(record.yjsState);
      expect(record.tiptapSchemaVersion).toBe(4);
    }

    const latest = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    expect(latest.storageRevision).toBe(2n);
    expect(persistedRecords.find((record) => record.storageRevision === 2n)?.yjsState).toEqual(
      latest.yjsState,
    );
  });

  it('reads persisted bytes and provenance from one document record', async () => {
    const pageId = await createPage();
    const repository = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const bytes = new Uint8Array([4, 5, 6]);
    const written = await repository.replaceYjsState(pageId, bytes);

    await expect(repository.find(pageId)).resolves.toEqual(written);
  });

  it('creates a snapshot with the exact PostgreSQL persisted capture provenance', async () => {
    const pageId = await createPage();
    const client = prisma as unknown as DatabaseClient;
    const documentRepository = new PrismaPageDocumentRepository(client);
    const yjsState = new Uint8Array([21, 22, 23, 24]);
    const persisted = await documentRepository.replaceYjsState(pageId, yjsState);

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
    const application = new SnapshotApplicationService(captureClient, permissions, createSnapshot);

    const created = await application.createManual(pageId, ownerId);
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
    const persisted = await repository.replaceYjsState(pageId, yjsState);

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
    const application = new SnapshotApplicationService(
      captureClient,
      permissions,
      createSnapshotManual as unknown as CreateSnapshotManualUseCase,
    );

    await expect(application.createManual(pageId, ownerId)).rejects.toThrow('insert failed');

    const current = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    const createdSnapshots = await prisma.documentSnapshot.findMany({ where: { pageId } });
    expect(current.yjsState).toEqual(yjsState);
    expect(current.storageRevision).toBe(persisted.storageRevision);
    expect(createdSnapshots).toEqual([]);
  });
});
