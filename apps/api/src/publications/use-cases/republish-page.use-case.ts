import { Inject, Injectable } from '@nestjs/common';
import { AssetsRepository } from '../../assets/assets.repository';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { DocumentCaptureClient } from '../../document-capture/document-capture.client';
import { projectDocument } from '../../document-projection/document-projection';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PageDocumentRepository } from '../../pages/page-document/page-document.repository';
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

export interface RepublishPageCommand {
  actorId: string;
  pageId: string;
  slug?: string;
}

@Injectable()
export class RepublishPageUseCase {
  constructor(
    @Inject(DocumentCaptureClient) private readonly capture: DocumentCaptureClient,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PageDocumentRepository) private readonly pageDocuments: PageDocumentRepository,
    @Inject(AssetsRepository) private readonly assets: AssetsRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
    @Inject(PublicationVersionPersistence)
    private readonly versionPersistence: PublicationVersionPersistence,
  ) {}

  async execute(command: RepublishPageCommand) {
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
    const requestedSlug =
      command.slug === undefined ? undefined : normalizePublicationSlug(command.slug);

    try {
      return await this.transactions.run(async (scope) => {
        await scope.lock(ownerLock(page.ownerId));
        assertRole(
          await this.permissions.bind(scope).resolveRole(command.actorId, command.pageId),
          PageRole.EDITOR,
        );

        const documents = this.pageDocuments.bind(scope);
        if (!(await documents.lockForPublication(command.pageId))) throw new PageNotFoundError();

        const pages = this.pages.bind(scope);
        const currentPage = await pages.findLivePublicationCover(command.pageId);
        if (!currentPage) throw new PageNotFoundError();
        const coverAssetId = currentPage.coverAssetId;
        const lockedAssetIds = [...new Set([...assetIds, ...(coverAssetId ? [coverAssetId] : [])])];
        if (lockedAssetIds.length > 0) {
          const assets = this.assets.bind(scope);
          await assets.lockForPublication(lockedAssetIds);
          const [availableAssets, grantedAssetIds] = await Promise.all([
            assets.findPublicationAssets(lockedAssetIds),
            assets.findPublicationGrants(command.pageId, lockedAssetIds),
          ]);
          const ready = new Set(
            availableAssets.filter((asset) => asset.status === 'ready').map(({ id }) => id),
          );
          const granted = new Set(grantedAssetIds);
          if (
            ready.size !== lockedAssetIds.length ||
            lockedAssetIds.some((assetId) => !granted.has(assetId))
          ) {
            throw new PublicationAssetUnavailableError();
          }
        }

        const publications = this.publications.bind(scope);
        const current = await publications.findByPage(command.pageId);
        if (!current || current.status === 'draft') throw new PublicationStateConflictError();
        const slug = requestedSlug ?? current.slug;

        const snapshot = await this.versionPersistence.createSnapshot(scope, {
          actorId: command.actorId,
          captured,
          pageId: command.pageId,
        });
        const pageAfterLock = await pages.findLivePublicationMetadata(command.pageId);
        if (!pageAfterLock) throw new PageNotFoundError();
        if (pageAfterLock.coverAssetId !== coverAssetId) throw new PublicationStateConflictError();

        const paths = new Set<string>();
        if (current.status === 'published' || current.slug !== slug) {
          paths.add(publicationPath(current.slug));
        }
        paths.add(publicationPath(slug));
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
