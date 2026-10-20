import { Inject, Injectable } from '@nestjs/common';
import { ownerLock } from '../common/helpers';
import { databaseClientOf, TransactionRunner } from '../database/transaction';
import { DocumentCaptureClient } from '../document-capture/document-capture.client';
import { projectDocument } from '../document-projection/document-projection';
import { SnapshotReason } from '../generated/prisma/enums';
import { PageRole } from '../page-permissions/constants';
import { assertRole } from '../page-permissions/helpers';
import { PagePermissionsRepository } from '../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../pages/errors';
import { PagesRepository } from '../pages/pages.repository';
import { CreateSnapshotInternalUseCase } from '../snapshots/use-cases/create-snapshot-internal.use-case';
import { normalizePublicationSlug, publicationPath } from './helpers';
import {
  PublicationAssetUnavailableError,
  PublicationSlugConflictError,
  PublicationStateConflictError,
} from './publication-errors';
import { PublicationsRepository } from './publications.repository';

export interface PublishPageCommand {
  actorId: string;
  pageId: string;
  slug: string;
}

export interface RepublishPageCommand {
  actorId: string;
  pageId: string;
  slug?: string;
}

@Injectable()
export class PublicationPipeline {
  constructor(
    @Inject(DocumentCaptureClient) private readonly capture: DocumentCaptureClient,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
    @Inject(CreateSnapshotInternalUseCase)
    private readonly createSnapshot: CreateSnapshotInternalUseCase,
  ) {}

  async publishFirst(command: PublishPageCommand) {
    return this.publish({
      ...command,
      mode: 'first',
      slug: normalizePublicationSlug(command.slug),
    });
  }

  async republish(command: RepublishPageCommand) {
    return this.publish({
      ...command,
      mode: 'republish',
      ...(command.slug === undefined ? {} : { slug: normalizePublicationSlug(command.slug) }),
    });
  }

  private async publish(
    command:
      | (PublishPageCommand & { mode: 'first'; slug: string })
      | (RepublishPageCommand & { mode: 'republish'; slug?: string }),
  ) {
    await this.permissions
      .resolveRole(command.actorId, command.pageId)
      .then((role) => assertRole(role, PageRole.EDITOR));
    const page = await this.pages.findLiveById(command.pageId);
    if (!page) throw new PageNotFoundError();

    const captured = await this.capture.capture(command.pageId);
    const projection = projectDocument({
      tiptapSchemaVersion: captured.tiptapSchemaVersion,
      yjsState: captured.yjsState,
    });
    const assetIds = [
      ...new Set([
        ...projection.mediaReferences.flatMap((reference) =>
          reference.type === 'asset' ? [reference.assetId] : [],
        ),
      ]),
    ].sort();

    try {
      return await this.transactions.run(async (scope) => {
        await scope.lock(ownerLock(page.ownerId));
        const permissions = this.permissions.bind(scope);
        assertRole(await permissions.resolveRole(command.actorId, command.pageId), PageRole.EDITOR);

        const db = databaseClientOf(scope);
        const lockedDocument = await db.$queryRaw<{ pageId: string }[]>`
          SELECT document."pageId"
          FROM "PageDocument" document
          JOIN "Page" page ON page."id" = document."pageId"
          JOIN "Project" project ON project."id" = page."projectId"
          WHERE document."pageId" = ${command.pageId}::uuid
            AND page."deletedAt" IS NULL AND project."deletedAt" IS NULL
          FOR UPDATE OF document
        `;
        if (lockedDocument.length === 0) throw new PageNotFoundError();

        const currentMetadata = await db.page.findFirst({
          select: { coverAssetId: true },
          where: { deletedAt: null, id: command.pageId, project: { deletedAt: null } },
        });
        if (!currentMetadata) throw new PageNotFoundError();
        const coverAssetId = currentMetadata.coverAssetId;
        const lockedAssetIds = [
          ...new Set([...assetIds, ...(coverAssetId ? [coverAssetId] : [])]),
        ].sort();
        if (lockedAssetIds.length > 0) {
          await db.$queryRaw`
            SELECT "id" FROM "Asset"
            WHERE "id" = ANY(${lockedAssetIds}::uuid[])
            ORDER BY "id" ASC FOR UPDATE
          `;
          const [assets, grants] = await Promise.all([
            db.asset.findMany({
              select: { id: true, status: true },
              where: { id: { in: lockedAssetIds } },
            }),
            db.pageAssetGrant.findMany({
              select: { assetId: true },
              where: { assetId: { in: lockedAssetIds }, pageId: command.pageId },
            }),
          ]);
          const ready = new Set(
            assets.filter((asset) => asset.status === 'ready').map(({ id }) => id),
          );
          const granted = new Set(grants.map(({ assetId }) => assetId));
          if (
            ready.size !== lockedAssetIds.length ||
            lockedAssetIds.some((assetId) => !granted.has(assetId))
          ) {
            throw new PublicationAssetUnavailableError();
          }
        }

        const repository = this.publications.bind(scope);
        const current = await repository.findByPage(command.pageId);
        if (
          (command.mode === 'first' && current !== null && current.status !== 'draft') ||
          (command.mode === 'republish' && (current === null || current.status === 'draft'))
        ) {
          throw new PublicationStateConflictError();
        }
        const slug = command.slug ?? current?.slug;
        if (!slug) throw new PublicationStateConflictError();

        const snapshot = await this.createSnapshot.execute(
          {
            ...captured,
            createdById: command.actorId,
            pageId: command.pageId,
            reason: SnapshotReason.publication,
          },
          scope,
        );
        const pageAfterLock = await db.page.findFirst({
          select: { coverAssetId: true, title: true },
          where: { deletedAt: null, id: command.pageId, project: { deletedAt: null } },
        });
        if (!pageAfterLock) throw new PageNotFoundError();
        if (pageAfterLock.coverAssetId !== coverAssetId) {
          throw new PublicationStateConflictError();
        }

        await db.documentRendering.create({
          data: {
            contentJson: projection.contentJson,
            coverAssetId,
            pageTitle: pageAfterLock.title,
            snapshotId: snapshot.id,
            tiptapSchemaVersion: projection.schemaVersion,
          },
        });
        if (assetIds.length > 0) {
          await db.snapshotAsset.createMany({
            data: projection.mediaReferences.flatMap((reference) =>
              reference.type === 'asset'
                ? [
                    {
                      assetId: reference.assetId,
                      nodeId: reference.nodeId,
                      snapshotId: snapshot.id,
                    },
                  ]
                : [],
            ),
          });
        }
        const publishedAt = new Date();
        const updated = await repository.publish({
          pageId: command.pageId,
          publishedAt,
          slug,
          snapshotId: snapshot.id,
        });
        await repository.createRevalidation([
          ...(current && (current.status === 'published' || current.slug !== updated.slug)
            ? [publicationPath(current.slug)]
            : []),
          publicationPath(updated.slug),
        ]);
        return { publication: updated, snapshot };
      });
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        throw new PublicationSlugConflictError();
      }
      throw error;
    }
  }
}

function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
