import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../../pages/pages.repository';
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
  ) {}

  execute(id: string, ownerId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const projects = this.projects.bind(scope);
      const deletedAt = new Date();

      if (!(await projects.markDeleted(id, ownerId, deletedAt))) {
        throw new ProjectNotFoundError();
      }

      await this.pages.bind(scope).markProjectPagesDeleted(id, ownerId, deletedAt);
    });
  }
}
