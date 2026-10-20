import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../../pages/pages.repository';
import { publicationPath } from '../../publications/helpers';
import { PublicationsRepository } from '../../publications/publications.repository';
import { ProjectNotFoundError } from '../errors';
import { ProjectsRepository } from '../projects.repository';

/**
 * Проект и его страницы помечаются одной транзакцией; блокировка владельца не даёт
 * создать страницу в уезжающем в корзину проекте.
 */
@Injectable()
export class SoftDeleteProjectUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
  ) {}

  execute(id: string, ownerId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const projects = this.projects.bind(scope);
      const pages = this.pages.bind(scope);
      const pageIds = await pages.findLiveIdsByProject(id);
      const publications = this.publications.bind(scope);
      const slugs = await publications.findPublishedPageSlugs(pageIds);
      const deletedAt = new Date();

      if (!(await projects.markDeleted(id, ownerId, deletedAt))) {
        throw new ProjectNotFoundError();
      }

      await pages.markProjectPagesDeleted(id, ownerId, deletedAt);
      await publications.markPublishedUnpublished(pageIds);
      await publications.createRevalidation(slugs.map(publicationPath));
    });
  }
}
