import { Inject, Injectable } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../../common/errors';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../../pages/pages.repository';
import { ProjectNotFoundError } from '../errors';
import { ProjectsRepository } from '../projects.repository';

/**
 * Безвозвратное удаление проекта из корзины. Перечень обречённых страниц и само
 * удаление идут одной транзакцией: иначе уничтожено будет не то, что подтвердили.
 */
@Injectable()
export class PurgeProjectUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(id: string, ownerId: string, cascade: boolean): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const projects = this.projects.bind(scope);

      if ((await projects.findDeletedByIdForOwner(id, ownerId)) === null) {
        throw new ProjectNotFoundError();
      }

      if (!cascade) {
        const doomed = await this.pages.bind(scope).findSelfDeletedTitlesByProjects([id], ownerId);

        if (doomed.length > 0) {
          throw new PurgeConfirmationRequiredError(doomed);
        }
      }

      await projects.deleteById(id);
    });
  }
}
