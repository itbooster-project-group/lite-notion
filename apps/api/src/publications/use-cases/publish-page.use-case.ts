import { Inject, Injectable } from '@nestjs/common';
import { ownerLock } from '../../common/helpers';
import { databaseClientOf, TransactionRunner } from '../../database/transaction';
import { DocumentCaptureClient } from '../../document-capture/document-capture.client';
import { projectDocument } from '../../document-projection/document-projection';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { normalizePublicationSlug, publicationPath } from '../helpers';
import {
  PublicationAssetUnavailableError,
  PublicationSlugConflictError,
  PublicationStateConflictError,
} from '../publication-errors';
import { isPublicationSlugUniqueViolation } from '../publication-unique-errors';
import { PublicationVersionPersistence } from '../publication-version.persistence';
import { PublicationsRepository } from '../publications.repository';

export interface PublishPageCommand {
  actorId: string;
  pageId: string;
  slug: string;
}

@Injectable()
export class PublishPageUseCase {
  constructor(
    @Inject(DocumentCaptureClient) private readonly capture: DocumentCaptureClient,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
    @Inject(PublicationVersionPersistence)
    private readonly versionPersistence: PublicationVersionPersistence,
  ) {}

  async execute(command: PublishPageCommand) {
    const slug = normalizePublicationSlug(command.slug);
    assertRole(
      await this.permissions.resolveRole(command.actorId, command.pageId),
      PageRole.EDITOR,
    );
    const page = await this.pages.findLiveById(command.pageId);
    if (!page) throw new PageNotFoundError();

    const captured = await this.capture.capture(command.pageId);
    const projection = projectDocument({
      tiptapSchemaVersion: captured.tiptapSchemaVersion,
      yjsState: captured.yjsState,
    });
    const assetIds = [
      ...new Set(
        projection.mediaReferences.flatMap((reference) =>
          reference.type === 'asset' ? [reference.assetId] : [],
        ),
      ),
    ].sort();
    try {
      return await this.transactions.run(async (scope) => {
        await scope.lock(ownerLock(page.ownerId));
        assertRole(
          await this.permissions.bind(scope).resolveRole(command.actorId, command.pageId),
          PageRole.EDITOR,
        );

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

        const currentPage = await db.page.findFirst({
          select: { coverAssetId: true },
          where: { deletedAt: null, id: command.pageId, project: { deletedAt: null } },
        });
        if (!currentPage) throw new PageNotFoundError();
        const coverAssetId = currentPage.coverAssetId;
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

        const publications = this.publications.bind(scope);
        const current = await publications.findByPage(command.pageId);
        if (current && current.status !== 'draft') throw new PublicationStateConflictError();
        const paths = new Set<string>();
        if (current && current.slug !== slug) paths.add(publicationPath(current.slug));
        paths.add(publicationPath(slug));

        const snapshot = await this.versionPersistence.createSnapshot(scope, {
          actorId: command.actorId,
          captured,
          pageId: command.pageId,
        });
        const pageAfterLock = await db.page.findFirst({
          select: { coverAssetId: true, title: true },
          where: { deletedAt: null, id: command.pageId, project: { deletedAt: null } },
        });
        if (!pageAfterLock) throw new PageNotFoundError();
        if (pageAfterLock.coverAssetId !== coverAssetId) throw new PublicationStateConflictError();

        const publication = await this.versionPersistence.persist(scope, {
          coverAssetId,
          pageId: command.pageId,
          pageTitle: pageAfterLock.title,
          projection,
          revalidationPaths: [...paths],
          snapshotId: snapshot.id,
          slug,
        });
        return { publication, snapshot };
      });
    } catch (error) {
      if (isPublicationSlugUniqueViolation(error)) throw new PublicationSlugConflictError();
      throw error;
    }
  }
}
