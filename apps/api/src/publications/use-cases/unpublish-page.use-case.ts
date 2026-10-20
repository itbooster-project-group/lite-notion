import { Inject, Injectable } from '@nestjs/common';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../../pages/errors';
import { PagesRepository } from '../../pages/pages.repository';
import { publicationPath } from '../helpers';
import { PublicationNotFoundError, PublicationStateConflictError } from '../publication-errors';
import { PublicationsRepository } from '../publications.repository';

@Injectable()
export class UnpublishPageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(PublicationsRepository) private readonly publications: PublicationsRepository,
  ) {}

  async execute(actorId: string, pageId: string) {
    const page = await this.pages.findLiveById(pageId);
    if (!page) throw new PageNotFoundError();
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(page.ownerId));
      const livePage = await this.pages.bind(scope).findLiveById(pageId);
      if (!livePage || livePage.ownerId !== page.ownerId) throw new PageNotFoundError();
      assertRole(await this.permissions.bind(scope).resolveRole(actorId, pageId), PageRole.EDITOR);
      const publications = this.publications.bind(scope);
      const current = await publications.findByPage(pageId);
      if (!current) throw new PublicationNotFoundError();
      if (current.status === 'draft') throw new PublicationStateConflictError();
      if (current.status === 'unpublished') return current;
      const updated = await publications.unpublish(pageId);
      if (!updated) throw new PublicationNotFoundError();
      await publications.createRevalidation([publicationPath(current.slug)]);
      return updated;
    });
  }
}
