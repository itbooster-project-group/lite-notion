import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPrismaClient, type PrismaClient } from '../database/client';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  PrismaTransactionRunner,
  type TransactionOptions,
  TransactionRunner,
  type TransactionScope,
} from '../database/transaction';
import { PrismaPagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PrismaPageDocumentRepository } from '../pages/page-document/page-document.repository';
import {
  PageSearchProjectionRepository,
  PrismaPageSearchProjectionRepository,
  type SearchProjectionFailure,
  type SearchProjectionFailureState,
} from '../pages/page-document/page-search-projection.repository';
import { SearchProjectionRetryScheduler } from '../pages/page-document/search-projection-retry.scheduler';
import { ProjectPageSearchUseCase } from '../pages/page-document/use-cases/project-page-search.use-case';
import type { SearchCandidate, SearchResultRecord } from './search.repository';
import { SearchRepository } from './search.repository';
import { SearchReadService } from './search-read.service';

function pauseOnce() {
  let signalEntered!: () => void;
  let signalRelease!: () => void;
  let used = false;
  const entered = new Promise<void>((resolve) => (signalEntered = resolve));
  const releasePromise = new Promise<void>((resolve) => (signalRelease = resolve));

  return {
    entered,
    pause: async () => {
      if (used) return;
      used = true;
      signalEntered();
      await releasePromise;
    },
    release: () => signalRelease(),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => (resolve = complete));
  return { promise, resolve };
}

interface ExplainPlanNode {
  'Actual Rows'?: number;
  'Actual Total Time'?: number;
  'Group Key'?: string[];
  'Index Name'?: string;
  'Node Type': string;
  'Relation Name'?: string;
  'Rows Removed by Filter'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Sort Method'?: string;
  Plans?: ExplainPlanNode[];
}

interface ExplainPlanEntry {
  Plan: ExplainPlanNode;
  'Execution Time': number;
  'Planning Time': number;
}

function summarizePlan(rows: Array<{ 'QUERY PLAN': ExplainPlanEntry[] }>) {
  const explain = rows[0]?.['QUERY PLAN']?.[0];
  if (explain === undefined) throw new Error('PostgreSQL returned no EXPLAIN plan');

  const nodes: ExplainPlanNode[] = [];
  const visit = (node: ExplainPlanNode): void => {
    nodes.push(node);
    node.Plans?.forEach(visit);
  };
  visit(explain.Plan);

  return {
    planningMs: explain['Planning Time'],
    executionMs: explain['Execution Time'],
    nodes: nodes
      .filter(({ 'Node Type': type }) => /Scan|Sort|Aggregate|Join|Limit/.test(type))
      .map((node) => ({
        type: node['Node Type'],
        relation: node['Relation Name'],
        index: node['Index Name'],
        rows: node['Actual Rows'],
        timeMs: node['Actual Total Time'],
        rowsFiltered: node['Rows Removed by Filter'],
        sharedHits: node['Shared Hit Blocks'],
        sharedReads: node['Shared Read Blocks'],
        sortMethod: node['Sort Method'],
        groupKey: node['Group Key'],
      })),
  };
}

class PauseAfterCandidatesRepository extends SearchRepository {
  constructor(
    client: DatabaseClient,
    private readonly pause: () => Promise<void>,
  ) {
    super(client);
  }

  override bind(scope: TransactionScope): SearchRepository {
    return new PauseAfterCandidatesRepository(databaseClientOf(scope), this.pause);
  }

  override async findCandidates(
    query: string,
    limit: number,
    offset: number,
  ): Promise<SearchCandidate[]> {
    const candidates = await super.findCandidates(query, limit, offset);
    await this.pause();
    return candidates;
  }
}

class PauseOnCandidateCallRepository extends SearchRepository {
  constructor(
    client: DatabaseClient,
    private readonly pauseAt: number,
    private readonly pause: () => Promise<void>,
    private readonly state = { calls: 0 },
  ) {
    super(client);
  }

  override bind(scope: TransactionScope): SearchRepository {
    return new PauseOnCandidateCallRepository(
      databaseClientOf(scope),
      this.pauseAt,
      this.pause,
      this.state,
    );
  }

  override async findCandidates(
    query: string,
    limit: number,
    offset: number,
  ): Promise<SearchCandidate[]> {
    const candidates = await super.findCandidates(query, limit, offset);
    this.state.calls += 1;
    if (this.state.calls === this.pauseAt) await this.pause();
    return candidates;
  }
}

class PauseBeforeVisibleResultsRepository extends SearchRepository {
  constructor(
    client: DatabaseClient,
    private readonly pause: () => Promise<void>,
  ) {
    super(client);
  }

  override bind(scope: TransactionScope): SearchRepository {
    return new PauseBeforeVisibleResultsRepository(databaseClientOf(scope), this.pause);
  }

  override async findVisibleResults(
    pageIds: readonly string[],
    bodyMatchIds: readonly string[],
    query: string,
  ): Promise<SearchResultRecord[]> {
    await this.pause();
    return super.findVisibleResults(pageIds, bodyMatchIds, query);
  }
}

class CountingSearchRepository extends SearchRepository {
  constructor(
    client: DatabaseClient,
    private readonly counters: { candidateQueries: number; visibleQueries: number },
  ) {
    super(client);
  }

  override bind(scope: TransactionScope): SearchRepository {
    return new CountingSearchRepository(databaseClientOf(scope), this.counters);
  }

  override findCandidates(
    query: string,
    limit: number,
    offset: number,
  ): Promise<SearchCandidate[]> {
    this.counters.candidateQueries += 1;
    return super.findCandidates(query, limit, offset);
  }

  override findVisibleResults(
    pageIds: readonly string[],
    bodyMatchIds: readonly string[],
    query: string,
  ): Promise<SearchResultRecord[]> {
    this.counters.visibleQueries += 1;
    return super.findVisibleResults(pageIds, bodyMatchIds, query);
  }
}

class CountingPagePermissionsService extends PagePermissionsService {
  constructor(
    repository: PrismaPagePermissionsRepository,
    private readonly counters: { permissionQueries: number },
  ) {
    super(repository);
  }

  override bind(scope: TransactionScope): PagePermissionsService {
    return new CountingPagePermissionsService(
      new PrismaPagePermissionsRepository(databaseClientOf(scope)),
      this.counters,
    );
  }

  override resolveRoles(userId: string, pageIds: readonly string[]) {
    this.counters.permissionQueries += 1;
    return super.resolveRoles(userId, pageIds);
  }
}

class CountingTransactionRunner extends TransactionRunner {
  calls = 0;

  constructor(private readonly delegate: TransactionRunner) {
    super();
  }

  override run<T>(
    operation: (scope: TransactionScope) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    this.calls += 1;
    return this.delegate.run(operation, options);
  }
}

class PauseProjectionStateRepository extends PageSearchProjectionRepository {
  constructor(
    private readonly delegate: PageSearchProjectionRepository,
    private readonly pause: () => Promise<void>,
  ) {
    super();
  }

  override bind(scope: TransactionScope): PageSearchProjectionRepository {
    return new PauseProjectionStateRepository(this.delegate.bind(scope), this.pause);
  }

  override async findFailureState(pageId: string): Promise<SearchProjectionFailureState | null> {
    const state = await this.delegate.findFailureState(pageId);
    await this.pause();
    return state;
  }

  override writeSuccess(pageId: string, plainText: string, revision: bigint): Promise<boolean> {
    return this.delegate.writeSuccess(pageId, plainText, revision);
  }

  override writeFailure(failure: SearchProjectionFailure): Promise<void> {
    return this.delegate.writeFailure(failure);
  }
}

function stateWithParagraphs(...paragraphs: string[]): Uint8Array<ArrayBuffer> {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment('default');
  for (const value of paragraphs) {
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    if (value.length > 0) text.insert(0, value);
    paragraph.insert(0, [text]);
    fragment.insert(fragment.length, [paragraph]);
  }
  const encoded = Y.encodeStateAsUpdate(ydoc);
  const state = new Uint8Array(encoded.byteLength);
  state.set(encoded);
  ydoc.destroy();
  return state;
}

describe('page search on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let actorId: string;
  let projectId: string;
  let search: SearchReadService;
  let indexer: ProjectPageSearchUseCase;
  const pageIds: string[] = [];

  async function createPage(options: {
    id?: string;
    title: string;
    body?: string;
    parentPageId?: string | null;
    restricted?: boolean;
  }): Promise<string> {
    const pageId = options.id ?? randomUUID();
    await prisma.page.create({
      data: {
        accessMode: options.restricted === true ? 'RESTRICTED' : 'INHERIT',
        createdById: ownerId,
        id: pageId,
        ownerId,
        parentPageId: options.parentPageId ?? null,
        position: 'a',
        projectId,
        title: options.title,
      },
    });
    await prisma.pageDocument.create({
      data: {
        pageId,
        tiptapSchemaVersion: 2,
        yjsState: stateWithParagraphs(options.body ?? ''),
      },
    });
    pageIds.push(pageId);
    return pageId;
  }

  async function indexPage(pageId: string): Promise<void> {
    const document = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    await indexer.execute({
      pageId,
      storageRevision: document.storageRevision,
      tiptapSchemaVersion: document.tiptapSchemaVersion,
      yjsState: document.yjsState,
    });
  }

  async function grant(pageId: string, role: 'VIEWER' | 'EDITOR' = 'VIEWER'): Promise<void> {
    await prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role, userId: actorId },
    });
  }

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    actorId = randomUUID();
    projectId = randomUUID();
    await prisma.user.createMany({
      data: [ownerId, actorId].map((id) => ({
        email: `${id}@search.integration.test`,
        id,
        name: id,
        passwordHash: 'test-hash',
      })),
    });
    await prisma.project.create({ data: { id: projectId, name: 'search', ownerId } });

    const documents = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const projections = new PrismaPageSearchProjectionRepository(
      prisma as unknown as DatabaseClient,
    );
    indexer = new ProjectPageSearchUseCase(
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
      documents,
      projections,
    );
    search = new SearchReadService(
      new SearchRepository(prisma as unknown as PrismaService),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );
  });

  afterEach(async () => {
    const ids = pageIds.splice(0);
    if (ids.length > 0) await prisma.page.deleteMany({ where: { id: { in: ids } } });
    await prisma.project.updateMany({ data: { deletedAt: null }, where: { id: projectId } });
  }, 60000);

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, actorId] } } });
    await prisma.$disconnect();
  });

  it('creates one projection row with the expected GIN indexes and cascades it with its page', async () => {
    const pageId = await createPage({ title: 'schema index page' });
    await indexPage(pageId);

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'PageSearchDocument_searchVector_idx',
          'Page_title_search_idx',
          'PageSearchDocument_pkey'
        )
    `;
    expect(new Set(indexes.map(({ indexname }) => indexname))).toEqual(
      new Set([
        'PageSearchDocument_searchVector_idx',
        'Page_title_search_idx',
        'PageSearchDocument_pkey',
      ]),
    );

    const duplicateInsert = prisma.$executeRaw`
      INSERT INTO "PageSearchDocument" (
        "pageId", "plainText", "searchVector", "sourceStorageRevision", "updatedAt"
      ) VALUES (${pageId}::uuid, '', ''::tsvector, 0, NOW())
    `;
    await expect(duplicateInsert).rejects.toThrow();

    await prisma.page.delete({ where: { id: pageId } });
    expect(await prisma.pageSearchDocument.count({ where: { pageId } })).toBe(0);
  });

  it('indexes persisted Y.Doc text and distinguishes successful empty content', async () => {
    const pageId = await createPage({ title: 'body projection', body: 'persisted search phrase' });
    await indexPage(pageId);
    const emptyPageId = await createPage({ title: 'empty document' });
    await indexPage(emptyPageId);

    const projection = await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } });
    expect(projection.plainText).toBe('persisted search phrase');
    expect(projection.sourceStorageRevision).toBe(0n);
    const empty = await prisma.pageSearchDocument.findUniqueOrThrow({
      where: { pageId: emptyPageId },
    });
    expect(empty.plainText).toBe('');
    expect(empty.sourceStorageRevision).toBe(0n);

    const document = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    const sameRevision = {
      pageId,
      storageRevision: document.storageRevision,
      tiptapSchemaVersion: document.tiptapSchemaVersion,
      yjsState: stateWithParagraphs('rebuilt body'),
    };
    await expect(indexer.execute(sameRevision)).resolves.toBe('skipped');
    await expect(indexer.execute(sameRevision, true)).resolves.toBe('projected');
    expect(
      (await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } })).plainText,
    ).toBe('rebuilt body');
  });

  it('searches current titles and fresh bodies, ranks titles first, and does not duplicate a page', async () => {
    const bodyOnly = await createPage({ title: 'plain note', body: 'rankabletoken appears here' });
    await indexPage(bodyOnly);
    const titleMatch = await createPage({
      title: 'rankabletoken heading',
      body: 'rankabletoken body',
    });
    await indexPage(titleMatch);
    const titleOnlyWithoutProjection = await createPage({ title: 'missingprojectiontoken' });

    const ranked = await search.searchPages(ownerId, 'rankabletoken', 10);
    expect(ranked.map(({ pageId }) => pageId)).toEqual([titleMatch, bodyOnly]);
    expect(ranked[0]?.snippet).toContain('rankabletoken');
    expect(ranked[1]?.snippet).toContain('rankabletoken');
    expect(await search.searchPages(ownerId, 'missingprojectiontoken', 10)).toMatchObject([
      { pageId: titleOnlyWithoutProjection, snippet: null },
    ]);

    const duplicate = await createPage({
      title: 'singlehitmarker title',
      body: 'singlehitmarker body',
    });
    await indexPage(duplicate);
    const matches = await search.searchPages(ownerId, 'singlehitmarker', 10);
    expect(matches.filter(({ pageId }) => pageId === duplicate)).toHaveLength(1);
  });

  it('orders equal title ranks by pageId and matches mixed-language terms in one field', async () => {
    const firstId = '00000000-0000-4000-8000-000000000003';
    const secondId = '00000000-0000-4000-8000-000000000004';
    await createPage({ id: secondId, title: 'stabletiephrase' });
    await createPage({ id: firstId, title: 'stabletiephrase' });
    const mixed = await createPage({ title: 'русский mixedlanguage english' });

    await expect(search.searchPages(ownerId, 'stabletiephrase', 10)).resolves.toMatchObject([
      { pageId: firstId },
      { pageId: secondId },
    ]);
    await expect(search.searchPages(ownerId, 'русский english', 10)).resolves.toMatchObject([
      { pageId: mixed },
    ]);
  });

  it('does not use a stale body projection and reflects page rename without reindexing', async () => {
    const pageId = await createPage({ title: 'old searchable name', body: 'oldbodyphrase' });
    await indexPage(pageId);
    await prisma.page.update({ data: { title: 'newrenametoken' }, where: { id: pageId } });
    await prisma.pageDocument.update({
      data: { storageRevision: 1n },
      where: { pageId },
    });

    await expect(search.searchPages(ownerId, 'oldbodyphrase', 10)).resolves.toEqual([]);
    await expect(search.searchPages(ownerId, 'newrenametoken', 10)).resolves.toMatchObject([
      { pageId, title: 'newrenametoken', snippet: null },
    ]);
  });

  it('keeps body results from the first snapshot when revision changes before the authorized read', async () => {
    const bodyOnly = await createPage({ title: 'unrelated title', body: 'interleavedbodymarker' });
    await indexPage(bodyOnly);
    const titleMatch = await createPage({
      title: 'interleavedbodymarker current title',
      body: 'interleavedbodymarker body',
    });
    await indexPage(titleMatch);

    const pause = pauseOnce();
    const interleavedSearch = new SearchReadService(
      new PauseAfterCandidatesRepository(prisma as unknown as DatabaseClient, pause.pause),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );
    const pendingSearch = interleavedSearch.searchPages(ownerId, 'interleavedbodymarker', 10);
    await pause.entered;
    await prisma.pageDocument.updateMany({
      data: { storageRevision: 1n },
      where: { pageId: { in: [bodyOnly, titleMatch] } },
    });
    pause.release();

    await expect(pendingSearch).resolves.toMatchObject([
      { pageId: titleMatch, title: 'interleavedbodymarker current title' },
      { pageId: bodyOnly, title: 'unrelated title' },
    ]);
  }, 15000);

  it('keeps candidate batches on the snapshot established by the first body search', async () => {
    const ids = Array.from(
      { length: 201 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    );
    pageIds.push(...ids);
    await prisma.$executeRaw`
      INSERT INTO "Page" (
        id, "ownerId", "projectId", "createdById", title, position, "createdAt", "updatedAt"
      )
      SELECT id, ${ownerId}::uuid, ${projectId}::uuid, ${ownerId}::uuid,
             'unrelated batch snapshot title', 'a', NOW(), NOW()
      FROM unnest(${ids}::uuid[]) AS generated(id)
    `;
    await prisma.$executeRaw`
      INSERT INTO "PageDocument" (
        "pageId", "tiptapSchemaVersion", "yjsState", "storageRevision", "createdAt", "updatedAt"
      )
      SELECT id, 2, ''::bytea, 0, NOW(), NOW() FROM unnest(${ids}::uuid[]) AS generated(id)
    `;
    await prisma.$executeRaw`
      INSERT INTO "PageSearchDocument" (
        "pageId", "plainText", "searchVector", "sourceStorageRevision",
        "attemptedStorageRevision", "attemptCount", "updatedAt"
      )
      SELECT id, 'batchsnapshotbodymarker', to_tsvector('simple', 'batchsnapshotbodymarker'),
             0, 0, 0, NOW()
      FROM unnest(${ids}::uuid[]) AS generated(id)
    `;

    const concurrentClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const pause = pauseOnce();
    const snapshotSearch = new SearchReadService(
      new PauseAfterCandidatesRepository(prisma as unknown as DatabaseClient, pause.pause),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );

    try {
      const pendingSearch = snapshotSearch.searchPages(ownerId, 'batchsnapshotbodymarker', 150);
      await pause.entered;
      await concurrentClient.pageDocument.updateMany({
        data: { storageRevision: 1n },
        where: { pageId: { in: ids.slice(0, 20) } },
      });
      pause.release();

      const results = await pendingSearch;
      expect(results.map(({ pageId }) => pageId)).toEqual(ids.slice(0, 150));
      expect(new Set(results.map(({ pageId }) => pageId)).size).toBe(150);
    } finally {
      pause.release();
      await concurrentClient.$disconnect();
    }
  }, 20000);

  it('returns an empty first batch from one transaction without permission or detail reads', async () => {
    const queryCounts = { candidateQueries: 0, visibleQueries: 0 };
    const transactions = new CountingTransactionRunner(
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );
    const emptySearch = new SearchReadService(
      new CountingSearchRepository(prisma as unknown as DatabaseClient, queryCounts),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      transactions,
    );

    await expect(
      emptySearch.searchPages(ownerId, 'nomatchingbatchsnapshotterm', 10),
    ).resolves.toEqual([]);
    expect(transactions.calls).toBe(1);
    expect(queryCounts).toEqual({ candidateQueries: 1, visibleQueries: 0 });
  });

  it('keeps multilingual FTS deterministic and requires positive terms in one field', async () => {
    const russian = await createPage({ title: 'русский поиск', body: 'сохранённый текст' });
    await indexPage(russian);
    const english = await createPage({ title: 'english title', body: 'persisted phrase' });
    await indexPage(english);
    const split = await createPage({ title: 'crossfieldalpha', body: 'crossfieldbeta' });
    await indexPage(split);
    const operator = await createPage({
      title: 'operatoralpha document',
      body: 'operatorbeta body',
    });
    await indexPage(operator);

    await expect(search.searchPages(ownerId, 'русский', 10)).resolves.toMatchObject([
      { pageId: russian },
    ]);
    await expect(search.searchPages(ownerId, 'persisted', 10)).resolves.toMatchObject([
      { pageId: english },
    ]);
    await expect(
      search.searchPages(ownerId, 'crossfieldalpha crossfieldbeta', 10),
    ).resolves.toEqual([]);
    await expect(search.searchPages(ownerId, '---', 10)).resolves.toEqual([]);
    await expect(search.searchPages(ownerId, '-privateword', 10)).resolves.toEqual([]);
    await expect(
      search.searchPages(ownerId, 'operatoralpha OR operatorbeta', 10),
    ).resolves.toMatchObject([{ pageId: operator }]);
  });

  it('returns a bounded plain-text snippet without HTML markers', async () => {
    const pageId = await createPage({
      title: 'bounded snippet',
      body: `snippetmarker ${'longcontext '.repeat(80)}`,
    });
    await indexPage(pageId);

    const [result] = await search.searchPages(ownerId, 'snippetmarker', 1);
    expect(result?.snippet).toContain('snippetmarker');
    expect(result?.snippet?.length).toBeLessThanOrEqual(240);
    expect(result?.snippet).not.toMatch(/<\/?(?:b|strong)>/i);
  });

  it('returns only pages allowed by effective permissions, including explicit access under a restricted parent', async () => {
    const inaccessible = await createPage({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'permissionsearchtoken secret title',
    });
    const inheritedRoot = await createPage({ title: 'permission root' });
    const inheritedChild = await createPage({
      title: 'permissionsearchtoken inherited title',
      parentPageId: inheritedRoot,
    });
    await grant(inheritedRoot, 'EDITOR');
    const restrictedRoot = await createPage({ restricted: true, title: 'closed parent title' });
    const explicitChild = await createPage({
      title: 'permissionsearchtoken direct child',
      parentPageId: restrictedRoot,
    });
    await grant(explicitChild);

    const matches = await search.searchPages(actorId, 'permissionsearchtoken', 1);
    expect(matches).toHaveLength(1);
    expect([inheritedChild, explicitChild]).toContain(matches[0]?.pageId);
    expect(JSON.stringify(matches)).not.toContain('secret title');
    expect(JSON.stringify(matches)).not.toContain('closed parent title');
    expect(matches.some(({ pageId }) => pageId === inaccessible)).toBe(false);

    await prisma.pagePermission.deleteMany({ where: { pageId: inheritedRoot, userId: actorId } });
    const afterRevoke = await search.searchPages(actorId, 'permissionsearchtoken', 10);
    expect(afterRevoke.some(({ pageId }) => pageId === inheritedChild)).toBe(false);
  });

  it('keeps permission and metadata reads on one snapshot during a concurrent revoke', async () => {
    const pageId = await createPage({ title: 'snapshotpermissionmarker original title' });
    await grant(pageId);
    const concurrentClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const pause = pauseOnce();
    const snapshotSearch = new SearchReadService(
      new PauseBeforeVisibleResultsRepository(prisma as unknown as DatabaseClient, pause.pause),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );

    try {
      const pendingSearch = snapshotSearch.searchPages(actorId, 'snapshotpermissionmarker', 10);
      await pause.entered;
      await concurrentClient.$transaction(async (transaction) => {
        await transaction.pagePermission.deleteMany({ where: { pageId, userId: actorId } });
        await transaction.page.update({
          data: { title: 'renamedafterpermissioncheck' },
          where: { id: pageId },
        });
      });
      pause.release();

      await expect(pendingSearch).resolves.toMatchObject([
        { pageId, title: 'snapshotpermissionmarker original title' },
      ]);
      await expect(search.searchPages(actorId, 'snapshotpermissionmarker', 10)).resolves.toEqual(
        [],
      );
    } finally {
      pause.release();
      await concurrentClient.$disconnect();
    }
  }, 15000);

  it('does not return a candidate when access is revoked before the search snapshot begins', async () => {
    const pageId = await createPage({ title: 'revokedbeforeconsistentreadmarker' });
    await grant(pageId);
    const concurrentClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const interleavedSearch = new SearchReadService(
      new SearchRepository(prisma as unknown as DatabaseClient),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );

    try {
      await concurrentClient.pagePermission.deleteMany({ where: { pageId, userId: actorId } });
      await expect(
        interleavedSearch.searchPages(actorId, 'revokedbeforeconsistentreadmarker', 10),
      ).resolves.toEqual([]);
    } finally {
      await concurrentClient.$disconnect();
    }
  }, 15000);

  it('continues past denied candidate batches with stable order and no duplicates', async () => {
    const deniedIds = Array.from(
      { length: 205 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    );
    pageIds.push(...deniedIds);
    await prisma.page.createMany({
      data: deniedIds.map((id) => ({
        createdById: ownerId,
        id,
        ownerId,
        position: 'a',
        projectId,
        title: 'batchvisibilitymarker',
      })),
    });
    const firstAllowed = await createPage({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      title: 'batchvisibilitymarker',
    });
    const secondAllowed = await createPage({
      id: 'ffffffff-ffff-4fff-8fff-fffffffffff0',
      title: 'batchvisibilitymarker',
    });
    await grant(firstAllowed);
    await grant(secondAllowed);
    const queryCounts = { candidateQueries: 0, permissionQueries: 0, visibleQueries: 0 };
    const batchedSearch = new SearchReadService(
      new CountingSearchRepository(prisma as unknown as DatabaseClient, queryCounts),
      new CountingPagePermissionsService(new PrismaPagePermissionsRepository(prisma), queryCounts),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );

    const firstRead = await batchedSearch.searchPages(actorId, 'batchvisibilitymarker', 2);
    const secondRead = await batchedSearch.searchPages(actorId, 'batchvisibilitymarker', 2);
    expect(firstRead.map(({ pageId }) => pageId)).toEqual([secondAllowed, firstAllowed]);
    expect(secondRead).toEqual(firstRead);
    expect(new Set(firstRead.map(({ pageId }) => pageId)).size).toBe(2);
    expect(queryCounts).toEqual({ candidateQueries: 6, permissionQueries: 6, visibleQueries: 2 });
    expect(
      queryCounts.candidateQueries + queryCounts.permissionQueries + queryCounts.visibleQueries,
    ).toBe(14);
  }, 20000);

  it('keeps one permission snapshot across batches until the next request', async () => {
    const deniedIds = Array.from(
      { length: 100 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    );
    pageIds.push(...deniedIds);
    await prisma.page.createMany({
      data: deniedIds.map((id) => ({
        createdById: ownerId,
        id,
        ownerId,
        position: 'a',
        projectId,
        title: 'batchsnapshotmarker',
      })),
    });
    const accessible = await createPage({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      title: 'batchsnapshotmarker',
    });
    await grant(accessible);
    const concurrentClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const pause = pauseOnce();
    const batchedSearch = new SearchReadService(
      new PauseOnCandidateCallRepository(prisma as unknown as DatabaseClient, 2, pause.pause),
      new PagePermissionsService(new PrismaPagePermissionsRepository(prisma)),
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
    );

    try {
      const pendingSearch = batchedSearch.searchPages(actorId, 'batchsnapshotmarker', 1);
      await pause.entered;
      await concurrentClient.pagePermission.deleteMany({
        where: { pageId: accessible, userId: actorId },
      });
      pause.release();
      await expect(pendingSearch).resolves.toMatchObject([
        { pageId: accessible, title: 'batchsnapshotmarker' },
      ]);
      await expect(search.searchPages(actorId, 'batchsnapshotmarker', 1)).resolves.toEqual([]);
    } finally {
      pause.release();
      await concurrentClient.$disconnect();
    }
  }, 15000);

  it('hides soft-deleted pages and projects and makes restored content searchable again', async () => {
    const pageId = await createPage({ title: 'restoresearchtoken' });
    await indexPage(pageId);
    await prisma.page.update({
      data: { deletedAt: new Date(), deletedOrigin: 'SELF' },
      where: { id: pageId },
    });
    await expect(search.searchPages(ownerId, 'restoresearchtoken', 10)).resolves.toEqual([]);

    await prisma.page.update({
      data: { deletedAt: null, deletedOrigin: null },
      where: { id: pageId },
    });
    await expect(search.searchPages(ownerId, 'restoresearchtoken', 10)).resolves.toMatchObject([
      { pageId },
    ]);

    await prisma.project.update({ data: { deletedAt: new Date() }, where: { id: projectId } });
    await expect(search.searchPages(ownerId, 'restoresearchtoken', 10)).resolves.toEqual([]);
    await prisma.project.update({ data: { deletedAt: null }, where: { id: projectId } });
  });

  it('protects successful projections from stale success and failure workers', async () => {
    const pageId = await createPage({ title: 'revision safety', body: 'new revision body' });
    const state16 = stateWithParagraphs('revision sixteen body');
    await prisma.pageDocument.update({
      data: { storageRevision: 16n, yjsState: state16 },
      where: { pageId },
    });
    const record16 = {
      pageId,
      storageRevision: 16n,
      tiptapSchemaVersion: 2,
      yjsState: state16,
    };
    await expect(indexer.execute(record16)).resolves.toBe('projected');

    await expect(
      indexer.execute({
        ...record16,
        storageRevision: 15n,
        tiptapSchemaVersion: 99,
      }),
    ).resolves.toBe('stale');
    const projection = await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } });
    expect(projection.sourceStorageRevision).toBe(16n);
    expect(projection.plainText).toBe('revision sixteen body');
    expect(projection.lastErrorCode).toBeNull();
  });

  it('allows duplicate workers for one revision and bounds each retry batch to 25 documents', async () => {
    const samePageId = await createPage({ title: 'duplicate worker page', body: 'same revision' });
    const sameDocument = await prisma.pageDocument.findUniqueOrThrow({
      where: { pageId: samePageId },
    });
    const sameRecord = {
      pageId: samePageId,
      storageRevision: sameDocument.storageRevision,
      tiptapSchemaVersion: sameDocument.tiptapSchemaVersion,
      yjsState: sameDocument.yjsState,
    };
    const secondWorker = new ProjectPageSearchUseCase(
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
      new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient),
      new PrismaPageSearchProjectionRepository(prisma as unknown as DatabaseClient),
    );
    await expect(
      Promise.all([indexer.execute(sameRecord), secondWorker.execute(sameRecord)]),
    ).resolves.toEqual(['projected', 'projected']);
    expect(await prisma.pageSearchDocument.count({ where: { pageId: samePageId } })).toBe(1);

    const batchPageIds = await Promise.all(
      Array.from({ length: 26 }, (_, index) =>
        createPage({ title: `bounded retry batch ${index}` }),
      ),
    );
    const scheduler = new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      indexer,
    );

    await scheduler.retryStaleProjections();
    expect(await prisma.pageSearchDocument.count({ where: { pageId: { in: batchPageIds } } })).toBe(
      25,
    );
    await scheduler.retryStaleProjections();
    expect(await prisma.pageSearchDocument.count({ where: { pageId: { in: batchPageIds } } })).toBe(
      26,
    );
  });

  it('does not commit a projection when the authoritative revision changes while building', async () => {
    const pageId = await createPage({ title: 'concurrent revision', body: 'captured revision' });
    let entered!: () => void;
    let release!: () => void;
    const atTransaction = new Promise<void>((resolve) => (entered = resolve));
    const waitForRelease = new Promise<void>((resolve) => (release = resolve));
    const realTransactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    const transactionRunner: TransactionRunner = {
      async run<T>(operation: (scope: TransactionScope) => Promise<T>) {
        entered();
        await waitForRelease;
        return realTransactions.run(operation);
      },
    };
    const documents = new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient);
    const projections = new PrismaPageSearchProjectionRepository(
      prisma as unknown as DatabaseClient,
    );
    const delayedIndexer = new ProjectPageSearchUseCase(
      transactionRunner as TransactionRunner,
      documents,
      projections,
    );
    const record = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });

    const indexing = delayedIndexer.execute({
      pageId,
      storageRevision: record.storageRevision,
      tiptapSchemaVersion: record.tiptapSchemaVersion,
      yjsState: record.yjsState,
    });
    await atTransaction;
    await prisma.pageDocument.update({ data: { storageRevision: 1n }, where: { pageId } });
    release();

    await expect(indexing).resolves.toBe('stale');
    expect(await prisma.pageSearchDocument.findUnique({ where: { pageId } })).toBeNull();
  });

  it('keeps revision 16 after concurrent stale success and failure workers finish', async () => {
    const successfulPage = await createPage({ title: 'concurrent success writer' });
    const failedPage = await createPage({ title: 'concurrent failure writer' });
    const initialRecords = await Promise.all(
      [successfulPage, failedPage].map((pageId) =>
        prisma.pageDocument.findUniqueOrThrow({ where: { pageId } }),
      ),
    );
    const concurrentClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const concurrentIndexer = new ProjectPageSearchUseCase(
      new PrismaTransactionRunner(concurrentClient as unknown as PrismaService),
      new PrismaPageDocumentRepository(concurrentClient as unknown as DatabaseClient),
      new PrismaPageSearchProjectionRepository(concurrentClient as unknown as DatabaseClient),
    );

    try {
      const recordsById = new Map(initialRecords.map((record) => [record.pageId, record]));
      for (const pageId of [successfulPage, failedPage]) {
        const initialRecord = recordsById.get(pageId);
        if (initialRecord === undefined) throw new Error(`Missing initial document for ${pageId}`);
        const state15 = stateWithParagraphs(`revision fifteen ${pageId}`);
        await prisma.pageDocument.update({
          data: { storageRevision: 15n, yjsState: state15 },
          where: { pageId },
        });
        const record15 = {
          pageId,
          storageRevision: 15n,
          tiptapSchemaVersion: initialRecord.tiptapSchemaVersion,
          yjsState: state15,
        };
        const pause = pauseOnce();
        const staleWorker = new ProjectPageSearchUseCase(
          new PrismaTransactionRunner(prisma as unknown as PrismaService),
          new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient),
          new PauseProjectionStateRepository(
            new PrismaPageSearchProjectionRepository(prisma as unknown as DatabaseClient),
            pause.pause,
          ),
        );
        const staleWork = staleWorker.execute({
          ...record15,
          ...(pageId === failedPage ? { tiptapSchemaVersion: 99 } : {}),
        });
        await pause.entered;

        const state16 = stateWithParagraphs(`revision sixteen ${pageId}`);
        await concurrentClient.pageDocument.update({
          data: { storageRevision: 16n, yjsState: state16 },
          where: { pageId },
        });
        await expect(
          concurrentIndexer.execute({
            pageId,
            storageRevision: 16n,
            tiptapSchemaVersion: initialRecord.tiptapSchemaVersion,
            yjsState: state16,
          }),
        ).resolves.toBe('projected');
        pause.release();
        await expect(staleWork).resolves.toBe('stale');

        const projection = await prisma.pageSearchDocument.findUniqueOrThrow({
          where: { pageId },
        });
        expect(projection.sourceStorageRevision).toBe(16n);
        expect(projection.attemptedStorageRevision).toBe(16n);
        expect(projection.plainText).toBe(`revision sixteen ${pageId}`);
        expect(projection.lastErrorCode).toBeNull();
      }
    } finally {
      await concurrentClient.$disconnect();
    }
  }, 30000);

  it('waits for authoritative persistence and rejects a stale projection after the row lock commits', async () => {
    const pageId = await createPage({ title: 'locked revision writer' });
    const record15 = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    const lockClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const workerClient = createPrismaClient({
      databaseConnectionTimeoutMs: 5000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    const lockAcquired = deferred();
    const releaseLock = deferred();
    let workerTransactionStarted!: () => void;
    const workerStarted = new Promise<void>((resolve) => (workerTransactionStarted = resolve));
    const realRunner = new PrismaTransactionRunner(workerClient as unknown as PrismaService);
    class ObservedTransactionRunner extends TransactionRunner {
      override run<T>(
        operation: (scope: TransactionScope) => Promise<T>,
        options?: Parameters<TransactionRunner['run']>[1],
      ): Promise<T> {
        return realRunner.run(async (scope) => {
          workerTransactionStarted();
          return operation(scope);
        }, options);
      }
    }
    const waitingWorker = new ProjectPageSearchUseCase(
      new ObservedTransactionRunner(),
      new PrismaPageDocumentRepository(workerClient as unknown as DatabaseClient),
      new PrismaPageSearchProjectionRepository(workerClient as unknown as DatabaseClient),
    );
    let blocker: Promise<void> | undefined;
    let staleProjection: Promise<string> | undefined;

    try {
      blocker = lockClient.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "pageId" FROM "PageDocument" WHERE "pageId" = ${pageId}::uuid FOR UPDATE`;
        lockAcquired.resolve();
        await releaseLock.promise;
        const updated = await new PrismaPageDocumentRepository(
          transaction as unknown as DatabaseClient,
        ).replaceYjsState(pageId, stateWithParagraphs('authoritative revision sixteen'), 0n, 2);
        expect(updated?.storageRevision).toBe(1n);
      });
      await lockAcquired.promise;
      staleProjection = waitingWorker.execute({
        pageId,
        storageRevision: record15.storageRevision,
        tiptapSchemaVersion: record15.tiptapSchemaVersion,
        yjsState: record15.yjsState,
      });
      await workerStarted;

      const deadline = Date.now() + 5000;
      let observedLockWait = false;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND wait_event_type = 'Lock'
              AND query ILIKE '%"PageDocument"%FOR UPDATE%'
          ) AS waiting
        `;
        if (rows[0]?.waiting === true) {
          observedLockWait = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(observedLockWait).toBe(true);
      releaseLock.resolve();
      await blocker;
      await expect(staleProjection).resolves.toBe('stale');
      expect(await prisma.pageSearchDocument.findUnique({ where: { pageId } })).toBeNull();
      expect(
        (await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } })).storageRevision,
      ).toBe(1n);
    } finally {
      releaseLock.resolve();
      if (blocker !== undefined) await Promise.allSettled([blocker]);
      if (staleProjection !== undefined) await Promise.allSettled([staleProjection]);
      await Promise.all([lockClient.$disconnect(), workerClient.$disconnect()]);
    }
  }, 20000);

  it('retries a placeholder after retryAfter and recovers using the same indexer', async () => {
    const pageId = await createPage({ title: 'retryable projection', body: 'retry body phrase' });
    let shouldFail = true;
    class FailOnceProjectionRepository extends PageSearchProjectionRepository {
      constructor(private readonly delegate: PageSearchProjectionRepository) {
        super();
      }
      bind(scope: TransactionScope): PageSearchProjectionRepository {
        return new FailOnceProjectionRepository(this.delegate.bind(scope));
      }
      writeSuccess(id: string, text: string, revision: bigint): Promise<boolean> {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('temporary projection error');
        }
        return this.delegate.writeSuccess(id, text, revision);
      }
      findFailureState(id: string) {
        return this.delegate.findFailureState(id);
      }
      writeFailure(failure: Parameters<PageSearchProjectionRepository['writeFailure']>[0]) {
        return this.delegate.writeFailure(failure);
      }
    }
    const repository = new FailOnceProjectionRepository(
      new PrismaPageSearchProjectionRepository(prisma as unknown as DatabaseClient),
    );
    const retryIndexer = new ProjectPageSearchUseCase(
      new PrismaTransactionRunner(prisma as unknown as PrismaService),
      new PrismaPageDocumentRepository(prisma as unknown as DatabaseClient),
      repository,
    );
    const document = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });
    const record = {
      pageId,
      storageRevision: document.storageRevision,
      tiptapSchemaVersion: document.tiptapSchemaVersion,
      yjsState: document.yjsState,
    };

    await expect(retryIndexer.execute(record)).resolves.toBe('failed');
    expect(await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } })).toMatchObject({
      attemptCount: 1,
      lastErrorCode: 'transient_projection',
      sourceStorageRevision: null,
    });
    const scheduler = new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      retryIndexer,
    );
    await scheduler.retryStaleProjections();
    expect(await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } })).toMatchObject({
      attemptCount: 1,
      sourceStorageRevision: null,
    });
    await prisma.$executeRaw`
      UPDATE "PageSearchDocument" SET "retryAfter" = NOW() - INTERVAL '1 second'
      WHERE "pageId" = ${pageId}::uuid
    `;

    await scheduler.retryStaleProjections();
    expect(await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } })).toMatchObject({
      attemptCount: 0,
      lastErrorCode: null,
      plainText: 'retry body phrase',
      sourceStorageRevision: 0n,
    });
  });

  it('does not let a permanent failure starve missing rows and unlocks a new document revision', async () => {
    const brokenPageId = await createPage({ title: 'permanent broken revision' });
    await prisma.pageDocument.update({
      data: { tiptapSchemaVersion: 99 },
      where: { pageId: brokenPageId },
    });
    const broken = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId: brokenPageId } });
    await expect(
      indexer.execute({
        pageId: brokenPageId,
        storageRevision: broken.storageRevision,
        tiptapSchemaVersion: broken.tiptapSchemaVersion,
        yjsState: broken.yjsState,
      }),
    ).resolves.toBe('failed');

    const missingPageId = await createPage({ title: 'missing row should proceed' });
    const scheduler = new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      indexer,
    );
    await scheduler.retryStaleProjections();
    expect(
      await prisma.pageSearchDocument.findUnique({ where: { pageId: missingPageId } }),
    ).not.toBe(null);

    await prisma.pageDocument.update({
      data: {
        storageRevision: 1n,
        tiptapSchemaVersion: 2,
        yjsState: stateWithParagraphs('recovered new revision'),
      },
      where: { pageId: brokenPageId },
    });
    const nextScheduler = new SearchProjectionRetryScheduler(
      prisma as unknown as PrismaService,
      indexer,
    );
    await nextScheduler.retryStaleProjections();
    expect(
      await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId: brokenPageId } }),
    ).toMatchObject({
      sourceStorageRevision: 1n,
      lastErrorCode: null,
    });
  });

  it('preserves a current successful projection and retry metadata after a failed forced rebuild', async () => {
    const pageId = await createPage({ title: 'forced rebuild', body: 'existing good projection' });
    await indexPage(pageId);
    await prisma.pageSearchDocument.update({
      data: {
        attemptCount: 2,
        attemptedStorageRevision: 0n,
        lastErrorCode: 'transient_projection',
        retryAfter: new Date(Date.now() + 60_000),
      },
      where: { pageId },
    });
    const before = await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } });
    const document = await prisma.pageDocument.findUniqueOrThrow({ where: { pageId } });

    await expect(
      indexer.execute(
        {
          pageId,
          storageRevision: document.storageRevision,
          tiptapSchemaVersion: 99,
          yjsState: document.yjsState,
        },
        true,
      ),
    ).resolves.toBe('failed');
    expect(await prisma.pageSearchDocument.findUniqueOrThrow({ where: { pageId } })).toEqual(
      before,
    );
  });

  it('checks GIN eligibility and records unforced search plans on a representative dataset', async () => {
    const ids = Array.from({ length: 20000 }, () => randomUUID());
    pageIds.push(...ids);
    const rarePageId = ids[0];
    await prisma.$executeRaw`
      INSERT INTO "Page" (
        id, "ownerId", "projectId", "createdById", title, position, "createdAt", "updatedAt"
      )
      SELECT id, ${ownerId}::uuid, ${projectId}::uuid, ${ownerId}::uuid,
             CASE WHEN id = ${rarePageId}::uuid
               THEN 'planrare title token'
               ELSE 'search plan filler title'
             END,
             'a', NOW(), NOW()
      FROM unnest(${ids}::uuid[]) AS generated(id)
    `;
    await prisma.$executeRaw`
      INSERT INTO "PageDocument" (
        "pageId", "tiptapSchemaVersion", "yjsState", "storageRevision", "createdAt", "updatedAt"
      )
      SELECT id, 2, ''::bytea, 1, NOW(), NOW() FROM unnest(${ids}::uuid[]) AS generated(id)
    `;
    await prisma.$executeRaw`
      INSERT INTO "PageSearchDocument" (
        "pageId", "plainText", "searchVector", "sourceStorageRevision",
        "attemptedStorageRevision", "attemptCount", "updatedAt"
      )
      SELECT id,
             CASE WHEN id = ${rarePageId}::uuid THEN 'planrare body token' ELSE 'search plan filler body' END,
             to_tsvector('simple', CASE WHEN id = ${rarePageId}::uuid
               THEN 'planrare body token' ELSE 'search plan filler body' END),
             1, 1, 0, NOW()
      FROM unnest(${ids}::uuid[]) AS generated(id)
    `;
    await prisma.$executeRaw`ANALYZE "Page"`;
    await prisma.$executeRaw`ANALYZE "PageDocument"`;
    await prisma.$executeRaw`ANALYZE "PageSearchDocument"`;

    const { titlePlan, bodyPlan } = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = OFF`;
      const titlePlan = await transaction.$queryRaw<Array<{ 'QUERY PLAN': unknown }>>`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT page.id
        FROM "Page" page
        WHERE to_tsvector('simple', COALESCE(page."title", ''))
          @@ websearch_to_tsquery('simple', 'planrare')
      `;
      const bodyPlan = await transaction.$queryRaw<Array<{ 'QUERY PLAN': unknown }>>`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT projection."pageId"
        FROM "PageSearchDocument" projection
        WHERE projection."searchVector" @@ websearch_to_tsquery('simple', 'planrare')
      `;
      return { bodyPlan, titlePlan };
    });

    expect(JSON.stringify(titlePlan)).toContain('Page_title_search_idx');
    expect(JSON.stringify(bodyPlan)).toContain('PageSearchDocument_searchVector_idx');

    const titleCandidatePlan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': ExplainPlanEntry[] }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT page.id
      FROM "Page" page
      JOIN "Project" project
        ON project.id = page."projectId" AND project."deletedAt" IS NULL
      WHERE page."deletedAt" IS NULL
        AND to_tsvector('simple', COALESCE(page."title", ''))
          @@ websearch_to_tsquery('simple', 'planrare')
    `;
    const bodyCandidatePlan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': ExplainPlanEntry[] }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT page.id
      FROM "PageSearchDocument" projection
      JOIN "PageDocument" document ON document."pageId" = projection."pageId"
      JOIN "Page" page
        ON page.id = projection."pageId" AND page."deletedAt" IS NULL
      JOIN "Project" project
        ON project.id = page."projectId" AND project."deletedAt" IS NULL
      WHERE projection."sourceStorageRevision" = document."storageRevision"
        AND projection."searchVector" @@ websearch_to_tsquery('simple', 'planrare')
    `;
    const combinedPlans = await Promise.all(
      [0, 100, 200].map(
        (offset) =>
          prisma.$queryRaw<Array<{ 'QUERY PLAN': ExplainPlanEntry[] }>>`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          WITH parsed AS (
            SELECT websearch_to_tsquery('simple', 'filler') AS query
          ), usable AS (
            SELECT query FROM parsed WHERE querytree(query) NOT IN ('', 'T')
          ), candidates AS (
            SELECT page.id AS "pageId", TRUE AS "titleMatch", FALSE AS "bodyMatch",
                   ts_rank_cd(setweight(to_tsvector('simple', COALESCE(page."title", '')), 'A'), usable.query) AS "titleRank",
                   0::real AS "bodyRank"
            FROM "Page" page
            JOIN "Project" project
              ON project.id = page."projectId" AND project."deletedAt" IS NULL
            CROSS JOIN usable
            WHERE page."deletedAt" IS NULL
              AND to_tsvector('simple', COALESCE(page."title", '')) @@ usable.query
            UNION ALL
            SELECT page.id AS "pageId", FALSE AS "titleMatch", TRUE AS "bodyMatch",
                   0::real AS "titleRank",
                   ts_rank_cd(setweight(projection."searchVector", 'D'), usable.query) AS "bodyRank"
            FROM "PageSearchDocument" projection
            JOIN "PageDocument" document ON document."pageId" = projection."pageId"
            JOIN "Page" page
              ON page.id = projection."pageId" AND page."deletedAt" IS NULL
            JOIN "Project" project
              ON project.id = page."projectId" AND project."deletedAt" IS NULL
            CROSS JOIN usable
            WHERE projection."sourceStorageRevision" = document."storageRevision"
              AND projection."searchVector" @@ usable.query
          ), grouped AS (
            SELECT "pageId", BOOL_OR("titleMatch") AS "titleMatch",
                   BOOL_OR("bodyMatch") AS "bodyMatch", MAX("titleRank") AS "titleRank",
                   MAX("bodyRank") AS "bodyRank"
            FROM candidates GROUP BY "pageId"
          )
          SELECT "pageId", "titleMatch", "bodyMatch", "titleRank", "bodyRank"
          FROM grouped
          ORDER BY "titleMatch" DESC, GREATEST("titleRank", "bodyRank") DESC, "pageId" ASC
          LIMIT 100 OFFSET ${offset}
        `,
      ),
    );
    console.info(
      '[search-plan] unforced EXPLAIN ANALYZE (20,000 pages):',
      JSON.stringify({
        title: summarizePlan(titleCandidatePlan),
        body: summarizePlan(bodyCandidatePlan),
        combinedOffsets: combinedPlans.map(summarizePlan),
      }),
    );
  }, 60000);
});
