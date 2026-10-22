import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPrismaClient, type PrismaClient } from '../database/client';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  PrismaTransactionRunner,
  type TransactionRunner,
  type TransactionScope,
} from '../database/transaction';
import { PrismaPagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { PrismaPageDocumentRepository } from '../pages/page-document/page-document.repository';
import {
  PageSearchProjectionRepository,
  PrismaPageSearchProjectionRepository,
} from '../pages/page-document/page-search-projection.repository';
import { SearchProjectionRetryScheduler } from '../pages/page-document/search-projection-retry.scheduler';
import { ProjectPageSearchUseCase } from '../pages/page-document/use-cases/project-page-search.use-case';
import { SearchRepository } from './search.repository';
import { SearchReadService } from './search-read.service';

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
    );
  });

  afterEach(async () => {
    for (const pageId of pageIds.splice(0).reverse()) {
      await prisma.page.deleteMany({ where: { id: pageId } });
    }
    await prisma.project.updateMany({ data: { deletedAt: null }, where: { id: projectId } });
  });

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

  it('uses GIN indexes in title and body candidate plans on a representative dataset', async () => {
    const ids = Array.from({ length: 3000 }, () => randomUUID());
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
        JOIN "PageDocument" document ON document."pageId" = projection."pageId"
        WHERE projection."sourceStorageRevision" = document."storageRevision"
          AND projection."searchVector" @@ websearch_to_tsquery('simple', 'planrare')
      `;
      return { bodyPlan, titlePlan };
    });

    expect(JSON.stringify(titlePlan)).toContain('Page_title_search_idx');
    expect(JSON.stringify(bodyPlan)).toContain('PageSearchDocument_searchVector_idx');
  });
});
