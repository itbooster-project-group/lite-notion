import { describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../database/transaction.in-memory';
import { SnapshotReason } from '../generated/prisma/enums';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import type { PagesRepository } from '../pages/pages.repository';
import type { UsersService } from '../users/users.service';
import { type InsertSnapshotInput, SnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import type { SnapshotMetadata } from './types/snapshot-metadata';
import { CreateSnapshotUseCase } from './use-cases/create-snapshot.use-case';

const OWNER_ID = 'owner';
const EDITOR_ID = 'editor';
const VIEWER_ID = 'viewer';
const PAGE_ID = 'page';

interface StoredSnapshotMetadata extends SnapshotMetadata {
  pageId: string;
}

class MemorySnapshotsRepository extends SnapshotsRepository {
  readonly records: StoredSnapshotMetadata[] = [];
  readonly inserts: InsertSnapshotInput[] = [];

  bind(): MemorySnapshotsRepository {
    return this;
  }

  async findLatestRevision(pageId: string): Promise<bigint | null> {
    const revisions = this.records
      .filter((snapshot) => snapshot.pageId === pageId)
      .map((snapshot) => snapshot.revision);

    return revisions.length === 0
      ? null
      : revisions.reduce((latest, item) => (item > latest ? item : latest));
  }

  async insert(input: InsertSnapshotInput): Promise<SnapshotMetadata> {
    this.inserts.push(input);
    const metadata: StoredSnapshotMetadata = {
      createdAt: new Date(),
      createdBy:
        input.createdById === null ? null : { id: input.createdById, name: input.createdById },
      id: `snapshot-${this.records.length + 1}`,
      pageId: input.pageId,
      reason: input.reason,
      revision: input.revision,
      sourceStorageRevision: input.sourceStorageRevision,
      tiptapSchemaVersion: input.tiptapSchemaVersion,
    };
    this.records.push(metadata);

    return metadata;
  }

  async listMetadataByPage(pageId: string): Promise<SnapshotMetadata[]> {
    return this.records
      .filter((snapshot) => snapshot.pageId === pageId)
      .sort((left, right) => (left.revision > right.revision ? -1 : 1));
  }

  async findMetadataByPageAndId(
    pageId: string,
    snapshotId: string,
  ): Promise<SnapshotMetadata | null> {
    return (
      this.records.find((snapshot) => snapshot.pageId === pageId && snapshot.id === snapshotId) ??
      null
    );
  }
}

function createService() {
  const livePages = new Set([PAGE_ID, 'other-page']);
  const roles = new Map<string, PageRole>([
    [`${OWNER_ID}:${PAGE_ID}`, PageRole.OWNER],
    [`${EDITOR_ID}:${PAGE_ID}`, PageRole.EDITOR],
    [`${VIEWER_ID}:${PAGE_ID}`, PageRole.VIEWER],
  ]);
  const permissionRepository = {
    bind: vi.fn(() => permissionRepository),
    resolveRole: vi.fn(
      async (userId: string, pageId: string) => roles.get(`${userId}:${pageId}`) ?? null,
    ),
  } as unknown as PagePermissionsRepository;
  const permissions = new PagePermissionsService(permissionRepository, {
    findByEmail: vi.fn(async () => null),
  } as unknown as UsersService);
  const pages = {
    bind: vi.fn(() => pages),
    lockLivePageForUpdate: vi.fn(async (pageId: string) => livePages.has(pageId)),
  } as unknown as PagesRepository;
  const snapshots = new MemorySnapshotsRepository();
  const transactions = new InMemoryTransactionRunner();
  const createSnapshot = new CreateSnapshotUseCase(
    transactions,
    pages,
    permissionRepository,
    snapshots,
  );
  const service = new SnapshotsService(createSnapshot, snapshots, permissions);

  return { createSnapshot, pages, permissionRepository, service, snapshots, transactions };
}

function capturedState() {
  return {
    storageRevision: 9n,
    tiptapSchemaVersion: 3,
    yjsState: new Uint8Array([1, 2, 3]),
  };
}

describe('SnapshotsService', () => {
  it('создаёт первый и следующий snapshot с page-scoped последовательными revision', async () => {
    const { service } = createService();

    const first = await service.createManual({
      ...capturedState(),
      createdById: OWNER_ID,
      pageId: PAGE_ID,
    });
    const second = await service.createManual({
      ...capturedState(),
      createdById: OWNER_ID,
      pageId: PAGE_ID,
    });
    const otherPage = await service.createInternal({
      ...capturedState(),
      createdById: null,
      pageId: 'other-page',
      reason: SnapshotReason.automatic,
    });

    expect([first.revision, second.revision, otherPage.revision]).toEqual([1n, 2n, 1n]);
  });

  it('сохраняет captured state, manual reason и creator', async () => {
    const { service, snapshots } = createService();
    const state = capturedState();

    const created = await service.createManual({
      ...state,
      createdById: EDITOR_ID,
      pageId: PAGE_ID,
    });

    expect(snapshots.inserts[0]).toMatchObject({
      createdById: EDITOR_ID,
      pageId: PAGE_ID,
      reason: SnapshotReason.manual,
      revision: 1n,
      sourceStorageRevision: state.storageRevision,
      tiptapSchemaVersion: state.tiptapSchemaVersion,
      yjsState: state.yjsState,
    });
    expect(created.createdBy).toEqual({ id: EDITOR_ID, name: EDITOR_ID });
  });

  it('разрешает owner и editor, но запрещает viewer создавать manual snapshot', async () => {
    const { service } = createService();

    await expect(
      service.createManual({ ...capturedState(), createdById: OWNER_ID, pageId: PAGE_ID }),
    ).resolves.toMatchObject({ reason: SnapshotReason.manual });
    await expect(
      service.createManual({ ...capturedState(), createdById: EDITOR_ID, pageId: PAGE_ID }),
    ).resolves.toMatchObject({ reason: SnapshotReason.manual });
    await expect(
      service.createManual({ ...capturedState(), createdById: VIEWER_ID, pageId: PAGE_ID }),
    ).rejects.toBeInstanceOf(PageRoleInsufficientError);
  });

  it('сохраняет not-found semantics для недоступной страницы', async () => {
    const { service } = createService();

    await expect(
      service.createManual({ ...capturedState(), createdById: 'stranger', pageId: PAGE_ID }),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it('позволяет trusted internal API задавать system reason без creator', async () => {
    const { service, snapshots } = createService();

    const created = await service.createInternal({
      ...capturedState(),
      createdById: null,
      pageId: PAGE_ID,
      reason: SnapshotReason.publication,
    });

    expect(created).toMatchObject({ reason: SnapshotReason.publication, createdBy: null });
    expect(snapshots.inserts[0]?.createdById).toBeNull();
  });

  it('использует переданный transaction scope, не открывая отдельную транзакцию', async () => {
    const { service, transactions } = createService();
    const externalScope = { lock: vi.fn(async () => undefined) };

    await service.createInternal(
      {
        ...capturedState(),
        createdById: null,
        pageId: PAGE_ID,
        reason: SnapshotReason.automatic,
      },
      externalScope,
    );

    expect(transactions.scopes).toHaveLength(0);
  });

  it('разрешает owner, editor и viewer читать metadata без Yjs state', async () => {
    const { service } = createService();
    await service.createInternal({
      ...capturedState(),
      createdById: null,
      pageId: PAGE_ID,
      reason: SnapshotReason.automatic,
    });

    for (const actorId of [OWNER_ID, EDITOR_ID, VIEWER_ID]) {
      const metadata = await service.listMetadata(PAGE_ID, actorId);
      expect(metadata).toHaveLength(1);
      expect(metadata[0]).not.toHaveProperty('yjsState');
    }
  });

  it('возвращает metadata по revision DESC и ограничивает get указанной страницей', async () => {
    const { service } = createService();
    const first = await service.createManual({
      ...capturedState(),
      createdById: OWNER_ID,
      pageId: PAGE_ID,
    });
    await service.createManual({ ...capturedState(), createdById: OWNER_ID, pageId: PAGE_ID });

    await expect(service.listMetadata(PAGE_ID, VIEWER_ID)).resolves.toMatchObject([
      { revision: 2n },
      { revision: 1n },
    ]);
    await expect(service.getMetadata(PAGE_ID, first.id, VIEWER_ID)).resolves.toMatchObject({
      id: first.id,
      revision: 1n,
    });
    await expect(service.getMetadata('other-page', first.id, OWNER_ID)).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });

  it('не раскрывает metadata страницы без доступа или snapshot несуществующей страницы', async () => {
    const { service } = createService();

    await expect(service.listMetadata(PAGE_ID, 'stranger')).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
    await expect(
      service.getMetadata('missing-page', 'missing-snapshot', OWNER_ID),
    ).rejects.toBeInstanceOf(PageNotFoundError);
  });
});
