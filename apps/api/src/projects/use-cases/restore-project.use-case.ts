import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../../pages/pages.repository';
import { ProjectNotFoundError } from '../errors';
import { type ProjectRecord, ProjectsRepository } from '../projects.repository';

/** Отметка снимается с проекта и с его страниц одной транзакцией. */
@Injectable()
export class RestoreProjectUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(id: string, ownerId: string): Promise<ProjectRecord> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const projects = this.projects.bind(scope);

      if (!(await projects.clearDeleted(id, ownerId))) {
        throw new ProjectNotFoundError();
      }

      await this.pages.bind(scope).clearProjectPagesDeleted(id, ownerId);

      const project = await projects.findByIdForOwner(id, ownerId);

      if (project === null) {
        throw new ProjectNotFoundError();
      }

      return project;
    });
  }
}
