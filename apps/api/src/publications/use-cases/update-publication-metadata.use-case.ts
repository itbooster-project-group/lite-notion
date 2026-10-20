import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { normalizePublicationSlug, publicationPath } from '../helpers';
import { PublicationSlugConflictError } from '../publication-errors';
import { isPublicationSlugUniqueViolation } from '../publication-unique-errors';
import { type PublicationMetadataUpdate, PublicationsRepository } from '../publications.repository';

export interface UpdatePublicationMetadataCommand {
  actorId: string;
  pageId: string;
  metadata: PublicationMetadataUpdate;
}

@Injectable()
export class UpdatePublicationMetadataUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
  ) {}

  async execute(command: UpdatePublicationMetadataCommand) {
    if (Object.keys(command.metadata).length === 0) {
      throw new BadRequestException('At least one metadata field is required');
    }
    const metadata = {
      ...command.metadata,
      ...(command.metadata.slug === undefined
        ? {}
        : { slug: normalizePublicationSlug(command.metadata.slug) }),
    };
    const page = await this.pages.findLiveById(command.pageId);
    if (!page) throw new PageNotFoundError();

    try {
      return await this.transactions.run(async (scope) => {
        await scope.lock(ownerLock(page.ownerId));
        const livePage = await this.pages.bind(scope).findLiveById(command.pageId);
        if (!livePage || livePage.ownerId !== page.ownerId) throw new PageNotFoundError();
        assertRole(
          await this.permissions.bind(scope).resolveRole(command.actorId, command.pageId),
          PageRole.EDITOR,
        );
        const publications = this.publications.bind(scope);
        const current = await publications.findByPage(command.pageId);
        if (!current) {
          if (metadata.slug === undefined)
            throw new BadRequestException('slug is required for a draft');
          return publications.createDraft(
            command.pageId,
            metadata as PublicationMetadataUpdate & { slug: string },
          );
        }

        const updated = await publications.updateMetadata(command.pageId, metadata);
        if (!updated) throw new PageNotFoundError();
        const nextPaths = new Set<string>();
        if (current.status === 'published' || current.slug !== updated.slug) {
          nextPaths.add(publicationPath(current.slug));
          nextPaths.add(publicationPath(updated.slug));
        }
        if (current.status !== 'published' && current.slug === updated.slug) {
          nextPaths.add(publicationPath(updated.slug));
        }
        await publications.createRevalidation([...nextPaths]);
        return updated;
      });
    } catch (error) {
      if (isPublicationSlugUniqueViolation(error)) throw new PublicationSlugConflictError();
      throw error;
    }
  }
}
