import { Inject, Injectable } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../../common/errors';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../../pages/pages.repository';
import { ProjectsRepository } from '../projects.repository';

/**
 * Правило подтверждения то же, что у удаления одного проекта.
 * Пустая корзина — успех, а не ошибка.
 */
@Injectable()
export class PurgeProjectsTrashUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(ownerId: string, cascade: boolean): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const projects = this.projects.bind(scope);
      const ids = await projects.findDeletedIdsByOwner(ownerId);

      if (ids.length === 0) {
        return;
      }

      if (!cascade) {
        const doomed = await this.pages.bind(scope).findSelfDeletedTitlesByProjects(ids, ownerId);

        if (doomed.length > 0) {
          throw new PurgeConfirmationRequiredError(doomed);
        }
      }

      await projects.deleteManyByIds(ids, ownerId);
    });
  }
}
