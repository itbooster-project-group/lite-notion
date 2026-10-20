import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { AssetGcUseCases } from '../assets/asset-gc.use-cases';
import { AssetsUseCases } from '../assets/assets.use-cases';
import type { ObjectStorage } from '../assets/storage/object-storage';
import type { ApplicationConfig } from '../config/application-config';
import { createPrismaClient, type PrismaClient } from '../database/client';
import type { PrismaService } from '../database/prisma.service';
import { type DatabaseClient, PrismaTransactionRunner } from '../database/transaction';
import {
  type CapturedDocumentState,
  DocumentCaptureClient,
} from '../document-capture/document-capture.client';
import { DocumentProjectionError } from '../document-projection/document-projection.errors';
import { PrismaPagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { RevokePagePermissionUseCase } from '../page-permissions/use-cases/revoke-page-permission.use-case';
import { PageNotFoundError } from '../pages/errors';
import { PrismaPagesRepository } from '../pages/pages.repository';
import { SoftDeletePageUseCase } from '../pages/use-cases/soft-delete-page.use-case';
import { PrismaSnapshotsRepository } from '../snapshots/snapshots.repository';
import { CreateSnapshotInternalUseCase } from '../snapshots/use-cases/create-snapshot-internal.use-case';
import {
  PublicationAssetUnavailableError,
  PublicationSlugConflictError,
} from './publication-errors';
import { PublicationVersionPersistence } from './publication-version.persistence';
import { PrismaPublicationsRepository } from './publications.repository';
import { PublicationsReadService } from './publications-read.service';
import { PublishPageUseCase } from './use-cases/publish-page.use-case';
import { RepublishPageUseCase } from './use-cases/republish-page.use-case';
import { UnpublishPageUseCase } from './use-cases/unpublish-page.use-case';

function textState(value: string): Uint8Array<ArrayBuffer> {
  const document = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  text.insert(0, value);
  paragraph.insert(0, [text]);
  document.getXmlFragment('default').insert(0, [paragraph]);
  const state = new Uint8Array(Y.encodeStateAsUpdate(document));
  document.destroy();
  return state;
}

function imageState(assetId: string): Uint8Array<ArrayBuffer> {
  const document = new Y.Doc();
  const image = new Y.XmlElement('image');
  image.setAttribute('nodeId', randomUUID());
  image.setAttribute('source', { type: 'asset', assetId } as unknown as string);
  image.setAttribute('alt', 'Published image');
  image.setAttribute('decorative', false as unknown as string);
  image.setAttribute('alignment', 'center');
  image.setAttribute('widthPercent', 100 as unknown as string);
  document.getXmlFragment('default').insert(0, [image]);
  const state = new Uint8Array(Y.encodeStateAsUpdate(document));
  document.destroy();
  return state;
}

describe('publication publish and republish use cases on PostgreSQL', () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let editorId: string;
  let projectId: string;
  let pageId: string;
  let captured!: CapturedDocumentState;
  let publishPage: PublishPageUseCase;
  let republishPage: RepublishPageUseCase;
  let captureClient: DocumentCaptureClient;
  let snapshotCreator: CreateSnapshotInternalUseCase;
  let permissionsRepository: PrismaPagePermissionsRepository;
  let transactions: PrismaTransactionRunner;
  let publications: PrismaPublicationsRepository;
  let read: PublicationsReadService;
  let snapshotIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient({
      databaseConnectionTimeoutMs: 5_000,
      databaseUrl:
        process.env.DATABASE_URL ??
        'postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public',
    });
    ownerId = randomUUID();
    editorId = randomUUID();
    projectId = randomUUID();
    await prisma.user.createMany({
      data: [ownerId, editorId].map((id) => ({
        email: `${id}@publication-pipeline.integration.test`,
        id,
        name: id,
        passwordHash: 'test-hash',
      })),
    });
    await prisma.project.create({ data: { id: projectId, name: 'publication pipeline', ownerId } });

    const client = prisma as unknown as DatabaseClient;
    transactions = new PrismaTransactionRunner(prisma as unknown as PrismaService);
    const pages = new PrismaPagesRepository(client);
    permissionsRepository = new PrismaPagePermissionsRepository(client);
    publications = new PrismaPublicationsRepository(client);
    const snapshots = new PrismaSnapshotsRepository(client);
    captureClient = {
      capture: async (id: string) => {
        await prisma.pageDocument.update({
          data: {
            storageRevision: captured.storageRevision,
            tiptapSchemaVersion: captured.tiptapSchemaVersion,
            yjsState: captured.yjsState,
          },
          where: { pageId: id },
        });
        return captured;
      },
    } as unknown as DocumentCaptureClient;
    snapshotCreator = new CreateSnapshotInternalUseCase(transactions, pages, snapshots);
    ({ publishPage, republishPage } = createUseCases(snapshotCreator));
    read = new PublicationsReadService(
      prisma as unknown as PrismaService,
      { signedReadUrl: async () => 'https://storage.example/signed' } as unknown as ObjectStorage,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fail_publication_rendering_insert ON "DocumentRendering"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_publication_rendering_insert()');
    if (snapshotIds.length > 0) {
      await prisma.documentSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
      snapshotIds = [];
    }
    if (pageId) await prisma.page.deleteMany({ where: { id: pageId } });
    pageId = '';
    if (assetIds.length > 0) {
      await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
      assetIds.length = 0;
    }
    await prisma.publicationRevalidation.deleteMany({
      where: { paths: { has: '/p/pipeline-first' } },
    });
    await prisma.publicationRevalidation.deleteMany({
      where: { paths: { has: '/p/pipeline-second' } },
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, editorId] } } });
    await prisma.$disconnect();
  });

  async function createPage(title: string, parentPageId: string | null = null): Promise<string> {
    pageId = randomUUID();
    await prisma.page.create({
      data: {
        createdById: ownerId,
        document: {
          create: { tiptapSchemaVersion: 1, yjsState: new Uint8Array(), storageRevision: 4n },
        },
        id: pageId,
        ownerId,
        parentPageId,
        position: 'a',
        projectId,
        title,
      },
    });
    return pageId;
  }

  function createUseCases(creator: CreateSnapshotInternalUseCase) {
    const pages = new PrismaPagesRepository(prisma as unknown as DatabaseClient);
    const persistence = new PublicationVersionPersistence(creator, publications);
    return {
      publishPage: new PublishPageUseCase(
        captureClient,
        transactions,
        pages,
        permissionsRepository,
        publications,
        persistence,
      ),
      republishPage: new RepublishPageUseCase(
        captureClient,
        transactions,
        pages,
        permissionsRepository,
        publications,
        persistence,
      ),
    };
  }

  async function grantEditor(pageId: string): Promise<void> {
    await prisma.pagePermission.create({
      data: { grantedById: ownerId, pageId, role: 'EDITOR', userId: editorId },
    });
  }

  async function publishAfterPermissionRevocation(
    pageId: string,
    revokePageId: string,
  ): Promise<void> {
    await new RevokePagePermissionUseCase(transactions, permissionsRepository).execute(
      ownerId,
      revokePageId,
      editorId,
    );
    await expect(
      publishPage.execute({ actorId: editorId, pageId, slug: `denied-${randomUUID()}` }),
    ).rejects.toBeInstanceOf(PageNotFoundError);
    expect(await prisma.pagePublication.findUnique({ where: { pageId } })).toBeNull();
  }

  async function publishBeforePermissionRevocation(
    pageId: string,
    revokePageId: string,
    beforeRelease?: () => void | Promise<void>,
    captureOverride?: CapturedDocumentState,
  ): Promise<string> {
    let signalEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pausedCreator = {
      execute: async (
        input: Parameters<CreateSnapshotInternalUseCase['execute']>[0],
        scope?: Parameters<CreateSnapshotInternalUseCase['execute']>[1],
      ) => {
        signalEntered();
        await gate;
        return snapshotCreator.execute(input, scope);
      },
    } as unknown as CreateSnapshotInternalUseCase;
    const page = await prisma.page.findUniqueOrThrow({
      where: { id: pageId },
      select: { title: true },
    });
    captured = captureOverride ?? {
      storageRevision: 20n,
      tiptapSchemaVersion: 1,
      yjsState: textState(page.title),
    };
    const { publishPage: serializedPublish } = createUseCases(pausedCreator);
    const publishPromise = serializedPublish.execute({
      actorId: editorId,
      pageId,
      slug: `serialized-${randomUUID()}`,
    });
    await entered;
    const revokePromise = new RevokePagePermissionUseCase(
      transactions,
      permissionsRepository,
    ).execute(ownerId, revokePageId, editorId);
    await beforeRelease?.();
    release();
    const published = await publishPromise;
    await revokePromise;
    snapshotIds.push(published.snapshot.id);
    expect(published.publication.status).toBe('published');
    expect(await permissionsRepository.resolveRole(editorId, pageId)).toBeNull();
    return published.snapshot.id;
  }

  async function createReadyAsset(): Promise<string> {
    const assetId = randomUUID();
    assetIds.push(assetId);
    await prisma.asset.create({
      data: {
        checksum: 'b'.repeat(64),
        id: assetId,
        mimeType: 'image/png',
        originalName: 'cover.png',
        sizeBytes: 1n,
        status: 'ready',
        storageKey: `assets/${assetId}`,
        uploadedById: ownerId,
      },
    });
    return assetId;
  }

  it('stores snapshot bytes, source revision, rendering, and publication from one capture', async () => {
    const id = await createPage('Captured title');
    const bytes = textState('captured body');
    captured = { storageRevision: 7n, tiptapSchemaVersion: 1, yjsState: bytes };

    const result = await publishPage.execute({
      actorId: ownerId,
      pageId: id,
      slug: 'pipeline-first',
    });
    snapshotIds.push(result.snapshot.id);

    const [snapshot, rendering, publication, publicView] = await Promise.all([
      prisma.documentSnapshot.findUnique({ where: { id: result.snapshot.id } }),
      prisma.documentRendering.findUnique({ where: { snapshotId: result.snapshot.id } }),
      prisma.pagePublication.findUnique({ where: { pageId: id } }),
      read.getPublic('pipeline-first'),
    ]);
    expect(snapshot).toMatchObject({
      pageId: id,
      reason: 'publication',
      revision: 1n,
      sourceStorageRevision: 7n,
      tiptapSchemaVersion: 1,
      yjsState: bytes,
    });
    expect(rendering).toMatchObject({
      pageTitle: 'Captured title',
      snapshotId: result.snapshot.id,
      tiptapSchemaVersion: 1,
      contentJson: {
        content: [{ content: [{ text: 'captured body', type: 'text' }], type: 'paragraph' }],
      },
    });
    expect(publication).toMatchObject({
      status: 'published',
      snapshotId: result.snapshot.id,
      slug: 'pipeline-first',
    });
    expect(publicView).toMatchObject({
      title: 'Captured title',
      contentJson: rendering?.contentJson,
    });
  });

  it('rolls back snapshot and publication when rendering persistence fails', async () => {
    const id = await createPage('rendering rollback');
    captured = { storageRevision: 11n, tiptapSchemaVersion: 1, yjsState: textState('rollback') };
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_publication_rendering_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced rendering failure'; END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_publication_rendering_insert
      BEFORE INSERT ON "DocumentRendering"
      FOR EACH ROW EXECUTE FUNCTION fail_publication_rendering_insert()
    `);

    await expect(
      publishPage.execute({ actorId: ownerId, pageId: id, slug: 'rendering-rollback' }),
    ).rejects.toThrow();

    expect(await prisma.documentSnapshot.count({ where: { pageId: id } })).toBe(0);
    expect(await prisma.pagePublication.findUnique({ where: { pageId: id } })).toBeNull();
    expect(
      await prisma.publicationRevalidation.count({
        where: { paths: { has: '/p/rendering-rollback' } },
      }),
    ).toBe(0);
  });

  it('fails closed on unsupported projection schema before creating any snapshot', async () => {
    const id = await createPage('unsupported schema');
    captured = { storageRevision: 12n, tiptapSchemaVersion: 99, yjsState: new Uint8Array() };

    await expect(
      publishPage.execute({ actorId: ownerId, pageId: id, slug: 'unsupported-schema' }),
    ).rejects.toBeInstanceOf(DocumentProjectionError);

    expect(await prisma.documentSnapshot.count({ where: { pageId: id } })).toBe(0);
    expect(await prisma.pagePublication.findUnique({ where: { pageId: id } })).toBeNull();
  });

  it('republish creates an immutable snapshot while live edits leave the previous rendering unchanged', async () => {
    const id = await createPage('Stable title');
    const firstBytes = textState('first captured body');
    captured = { storageRevision: 8n, tiptapSchemaVersion: 1, yjsState: firstBytes };
    const first = await publishPage.execute({
      actorId: ownerId,
      pageId: id,
      slug: 'pipeline-first',
    });
    snapshotIds.push(first.snapshot.id);

    await prisma.pageDocument.update({
      data: { storageRevision: 9n, yjsState: textState('live-only edit') },
      where: { pageId: id },
    });
    await expect(read.getPublic('pipeline-first')).resolves.toMatchObject({
      contentJson: { content: [{ content: [{ text: 'first captured body' }] }] },
    });

    const secondBytes = textState('republished body');
    captured = { storageRevision: 10n, tiptapSchemaVersion: 1, yjsState: secondBytes };
    const second = await republishPage.execute({ actorId: ownerId, pageId: id });
    snapshotIds.push(second.snapshot.id);

    const [previous, secondSnapshot, current] = await Promise.all([
      prisma.documentSnapshot.findUnique({ where: { id: first.snapshot.id } }),
      prisma.documentSnapshot.findUnique({ where: { id: second.snapshot.id } }),
      prisma.pagePublication.findUnique({ where: { pageId: id } }),
    ]);
    expect(previous).toMatchObject({ sourceStorageRevision: 8n, yjsState: firstBytes });
    expect(secondSnapshot).toMatchObject({ sourceStorageRevision: 10n, yjsState: secondBytes });
    expect(current).toMatchObject({ snapshotId: second.snapshot.id, status: 'published' });
    await expect(read.getPublic('pipeline-first')).resolves.toMatchObject({
      contentJson: { content: [{ content: [{ text: 'republished body' }] }] },
    });
  });

  it('serializes direct editor revoke before publish and rechecks permission', async () => {
    const id = await createPage('direct revoke');
    await grantEditor(id);
    await publishAfterPermissionRevocation(id, id);
  });

  it('serializes inherited editor revoke before publishing a descendant', async () => {
    const root = await createPage('inherited root');
    const child = await createPage('inherited child', root);
    await grantEditor(root);
    await publishAfterPermissionRevocation(child, root);
  });

  it('holds the owner lock through direct permission check and publication before revoke', async () => {
    const id = await createPage('direct publish first');
    await grantEditor(id);
    await publishBeforePermissionRevocation(id, id);
  });

  it('holds the owner lock through inherited permission check and publication before revoke', async () => {
    const root = await createPage('inherited publish root');
    const child = await createPage('inherited publish child', root);
    await grantEditor(root);
    await publishBeforePermissionRevocation(child, root);
  });

  it('captures a title change completed during publish at the Page row serialization point', async () => {
    const id = await createPage('title before');
    await grantEditor(id);
    const snapshotId = await publishBeforePermissionRevocation(id, id, async () => {
      await prisma.page.update({ data: { title: 'title after' }, where: { id } });
    });
    await expect(
      prisma.documentRendering.findUnique({ where: { snapshotId } }),
    ).resolves.toMatchObject({ pageTitle: 'title after' });
  });

  it('serializes a cover change behind publication and stores the cover active at commit', async () => {
    const id = await createPage('cover serialization');
    await grantEditor(id);
    const oldCoverId = await createReadyAsset();
    const newCoverId = await createReadyAsset();
    await prisma.pageAssetGrant.createMany({
      data: [oldCoverId, newCoverId].map((assetId) => ({ pageId: id, assetId })),
    });
    await prisma.page.update({ data: { coverAssetId: oldCoverId }, where: { id } });
    await prisma.pageAssetProjection.create({ data: { pageId: id, sourceStorageRevision: 20n } });
    const assets = new AssetsUseCases(
      prisma as unknown as PrismaService,
      new PagePermissionsService(permissionsRepository),
      {} as unknown as ObjectStorage,
      { assets: { readUrlTtlSeconds: 60 } } as ApplicationConfig,
    );
    let coverChange: Promise<void> | undefined;
    const snapshotId = await publishBeforePermissionRevocation(id, id, () => {
      coverChange = assets.setCover(ownerId, id, newCoverId);
    });
    await coverChange;

    await expect(
      prisma.documentRendering.findUnique({ where: { snapshotId } }),
    ).resolves.toMatchObject({ coverAssetId: oldCoverId });
    await expect(
      prisma.page.findUnique({ where: { id }, select: { coverAssetId: true } }),
    ).resolves.toEqual({ coverAssetId: newCoverId });
    const gc = new AssetGcUseCases(
      prisma as unknown as PrismaService,
      { deleteObject: async () => undefined } as unknown as ObjectStorage,
      { assets: { projectionStaleWarningSeconds: 300 } } as ApplicationConfig,
    );
    await expect(gc.delete(ownerId, oldCoverId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a captured asset when publish acquires its locks before GC', async () => {
    const id = await createPage('publish wins GC race');
    await grantEditor(id);
    const assetId = await createReadyAsset();
    await prisma.pageAssetGrant.create({ data: { assetId, pageId: id } });
    await prisma.pageAssetProjection.create({ data: { pageId: id, sourceStorageRevision: 20n } });
    const gc = new AssetGcUseCases(
      prisma as unknown as PrismaService,
      { deleteObject: async () => undefined } as unknown as ObjectStorage,
      { assets: { projectionStaleWarningSeconds: 300 } } as ApplicationConfig,
    );
    let gcAttempt: Promise<void> | undefined;
    const snapshotId = await publishBeforePermissionRevocation(
      id,
      id,
      () => {
        gcAttempt = gc.delete(ownerId, assetId);
      },
      { storageRevision: 20n, tiptapSchemaVersion: 2, yjsState: imageState(assetId) },
    );

    await expect(gcAttempt).rejects.toBeInstanceOf(ConflictException);
    await expect(
      prisma.documentRendering.findUnique({ where: { snapshotId } }),
    ).resolves.toMatchObject({
      contentJson: { content: [{ attrs: { source: { type: 'asset', assetId } }, type: 'image' }] },
    });
    await expect(prisma.asset.findUnique({ where: { id: assetId } })).resolves.toMatchObject({
      status: 'ready',
    });
  });

  it('rejects publishing when GC tombstones an asset first', async () => {
    const id = await createPage('GC wins publish race');
    const assetId = await createReadyAsset();
    await prisma.pageAssetGrant.create({ data: { assetId, pageId: id } });
    await prisma.pageAssetProjection.create({ data: { pageId: id, sourceStorageRevision: 4n } });
    const gc = new AssetGcUseCases(
      prisma as unknown as PrismaService,
      { deleteObject: async () => undefined } as unknown as ObjectStorage,
      { assets: { projectionStaleWarningSeconds: 300 } } as ApplicationConfig,
    );
    await gc.delete(ownerId, assetId);
    captured = { storageRevision: 21n, tiptapSchemaVersion: 2, yjsState: imageState(assetId) };

    await expect(
      publishPage.execute({ actorId: ownerId, pageId: id, slug: 'gc-wins-publish' }),
    ).rejects.toBeInstanceOf(PublicationAssetUnavailableError);
    expect(await prisma.documentSnapshot.count({ where: { pageId: id } })).toBe(0);
    expect(await prisma.pagePublication.findUnique({ where: { pageId: id } })).toBeNull();
  });

  it('serializes simultaneous publications with the same global slug and rolls back the loser', async () => {
    const firstPageId = await createPage('slug collision first');
    const secondPageId = await createPage('slug collision second');
    captured = {
      storageRevision: 30n,
      tiptapSchemaVersion: 1,
      yjsState: textState('same slug race'),
    };

    const outcomes = await Promise.allSettled([
      publishPage.execute({
        actorId: ownerId,
        pageId: firstPageId,
        slug: 'concurrent-shared-slug',
      }),
      publishPage.execute({
        actorId: ownerId,
        pageId: secondPageId,
        slug: 'concurrent-shared-slug',
      }),
    ]);

    const winner = outcomes.find((outcome) => outcome.status === 'fulfilled');
    const loserIndex = outcomes.findIndex((outcome) => outcome.status === 'rejected');
    expect(winner?.status).toBe('fulfilled');
    expect(loserIndex).not.toBe(-1);
    if (winner?.status !== 'fulfilled')
      throw new Error('Expected exactly one successful publication');
    if (loserIndex === -1) throw new Error('Expected one slug conflict');
    expect(outcomes[loserIndex]).toMatchObject({
      status: 'rejected',
      reason: expect.any(PublicationSlugConflictError),
    });

    const publications = await prisma.pagePublication.findMany({
      select: { pageId: true, slug: true, status: true },
      where: { slug: 'concurrent-shared-slug' },
    });
    expect(publications).toHaveLength(1);
    const losingPageId = loserIndex === 0 ? firstPageId : secondPageId;
    expect(await prisma.documentSnapshot.count({ where: { pageId: losingPageId } })).toBe(0);
  });

  it('serializes publish before page soft delete and leaves only the durable unpublished snapshot', async () => {
    const id = await createPage('publish and soft delete');
    let signalEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pausedCreator = {
      execute: async (
        input: Parameters<CreateSnapshotInternalUseCase['execute']>[0],
        scope?: Parameters<CreateSnapshotInternalUseCase['execute']>[1],
      ) => {
        signalEntered();
        await gate;
        return snapshotCreator.execute(input, scope);
      },
    } as unknown as CreateSnapshotInternalUseCase;
    const { publishPage: pausedPublish } = createUseCases(pausedCreator);
    captured = {
      storageRevision: 40n,
      tiptapSchemaVersion: 1,
      yjsState: textState('deleted after publish'),
    };
    const publish = pausedPublish.execute({
      actorId: ownerId,
      pageId: id,
      slug: 'publish-delete-race',
    });
    await entered;
    const softDelete = new SoftDeletePageUseCase(
      transactions,
      new PrismaPagesRepository(prisma as unknown as DatabaseClient),
      permissionsRepository,
      publications,
    ).execute(id, ownerId);
    release();
    const [published] = await Promise.all([publish, softDelete]);
    snapshotIds.push(published.snapshot.id);

    await expect(
      prisma.pagePublication.findUnique({ where: { pageId: id } }),
    ).resolves.toMatchObject({
      status: 'unpublished',
      snapshotId: published.snapshot.id,
    });
    await expect(read.getPublic('publish-delete-race')).resolves.toBeNull();
    await expect(prisma.page.findUnique({ where: { id } })).resolves.toMatchObject({
      deletedOrigin: 'SELF',
    });
  });

  it('rejects publish when page soft delete commits first', async () => {
    const id = await createPage('soft delete wins');
    await new SoftDeletePageUseCase(
      transactions,
      new PrismaPagesRepository(prisma as unknown as DatabaseClient),
      permissionsRepository,
      publications,
    ).execute(id, ownerId);
    captured = {
      storageRevision: 41n,
      tiptapSchemaVersion: 1,
      yjsState: textState('must not publish'),
    };

    await expect(
      publishPage.execute({ actorId: ownerId, pageId: id, slug: 'delete-first-race' }),
    ).rejects.toBeInstanceOf(PageNotFoundError);
    expect(await prisma.documentSnapshot.count({ where: { pageId: id } })).toBe(0);
    expect(await prisma.pagePublication.findUnique({ where: { pageId: id } })).toBeNull();
  });

  it('serializes republish before unpublish without losing the final unpublish state', async () => {
    const id = await createPage('republish and unpublish');
    captured = {
      storageRevision: 50n,
      tiptapSchemaVersion: 1,
      yjsState: textState('first version'),
    };
    const first = await publishPage.execute({
      actorId: ownerId,
      pageId: id,
      slug: 'unpublish-race',
    });
    snapshotIds.push(first.snapshot.id);

    let signalEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pausedCreator = {
      execute: async (
        input: Parameters<CreateSnapshotInternalUseCase['execute']>[0],
        scope?: Parameters<CreateSnapshotInternalUseCase['execute']>[1],
      ) => {
        signalEntered();
        await gate;
        return snapshotCreator.execute(input, scope);
      },
    } as unknown as CreateSnapshotInternalUseCase;
    const { republishPage: pausedRepublish } = createUseCases(pausedCreator);
    captured = { storageRevision: 51n, tiptapSchemaVersion: 1, yjsState: textState('republished') };
    const republish = pausedRepublish.execute({ actorId: ownerId, pageId: id });
    await entered;
    const unpublish = new UnpublishPageUseCase(
      transactions,
      new PrismaPagesRepository(prisma as unknown as DatabaseClient),
      permissionsRepository,
      publications,
    ).execute(ownerId, id);
    release();
    const [republished] = await Promise.all([republish, unpublish]);
    snapshotIds.push(republished.snapshot.id);

    await expect(
      prisma.pagePublication.findUnique({ where: { pageId: id } }),
    ).resolves.toMatchObject({
      status: 'unpublished',
      snapshotId: republished.snapshot.id,
    });
    await expect(read.getPublic('unpublish-race')).resolves.toBeNull();
  });
});
