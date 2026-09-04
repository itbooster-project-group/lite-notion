import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import type { TransactionScope } from '../../database/transaction';
import { TransactionRunner } from '../../database/transaction';
import { ProjectNotFoundError } from '../../projects/errors';
import { ProjectsRepository } from '../../projects/projects.repository';
import {
  PageNotFoundError,
  PageRestoreProjectDeletedError,
  PageRestoreTargetProjectRejectedError,
} from '../errors';
import { positionBetween } from '../helpers';
import type { DeletedPageRecord } from '../pages.repository';
import { type PageRecord, PagesRepository } from '../pages.repository';

export interface RestorePageCommand {
  pageId: string;
  ownerId: string;
  /**
   * Принимается только когда собственный проект страницы лежит в корзине:
   * восстановить её на место некуда, и клиент выбирает живой проект.
   */
  targetProjectId: string | null;
}

/**
 * Вложенная страница поднимается в корень: её родитель остался в корзине, и
 * вернуть её на место некуда.
 */
@Injectable()
export class RestorePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
  ) {}

  execute(command: RestorePageCommand): Promise<PageRecord> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(command.ownerId));

      const pages = this.pages.bind(scope);
      const page = await pages.findDeletedForOwner(command.pageId, command.ownerId);

      if (page === null) {
        throw new PageNotFoundError();
      }

      const destinationProjectId = await this.resolveDestination(scope, page, command);
      const movesProject = destinationProjectId !== page.projectId;

      // Перенос идёт до снятия отметки: тройной FK требует менять предка и
      // потомков одним statement'ом.
      if (movesProject) {
        await pages.moveSubtreeToProject(page.id, destinationProjectId);
      }

      const parentIsGone =
        page.parentPageId !== null &&
        (await pages.findByIdForOwner(page.parentPageId, command.ownerId)) === null;

      await pages.clearSubtreeDeletion(page.id);

      const raises = movesProject || parentIsGone;

      if (!raises || (!movesProject && page.parentPageId === null)) {
        return this.reread(pages, page.id, command.ownerId);
      }

      // Прежний ранг не переиспользуется: он из другой группы братьев.
      const last = await pages.findLastPositionAtLevel({
        excludedId: page.id,
        ownerId: command.ownerId,
        parentPageId: null,
        projectId: destinationProjectId,
      });

      return pages.reparent(page.id, null, positionBetween(last, null));
    });
  }

  /**
   * Живой собственный проект — восстановление на место; удалённый требует проект
   * назначения: живой страницы в удалённом проекте не бывает.
   */
  private async resolveDestination(
    scope: TransactionScope,
    page: DeletedPageRecord,
    command: RestorePageCommand,
  ): Promise<string> {
    const projects = this.projects.bind(scope);
    const own = await projects.findAnyByIdForOwner(page.projectId, command.ownerId);

    if (own !== null && own.deletedAt === null) {
      if (command.targetProjectId !== null && command.targetProjectId !== page.projectId) {
        throw new PageRestoreTargetProjectRejectedError();
      }

      return page.projectId;
    }

    if (command.targetProjectId === null) {
      throw new PageRestoreProjectDeletedError();
    }

    // Чужой, удалённый и несуществующий проект назначения неразличимы.
    const target = await projects.findByIdForOwner(command.targetProjectId, command.ownerId);

    if (target === null) {
      throw new ProjectNotFoundError();
    }

    return target.id;
  }

  private async reread(
    pages: PagesRepository,
    pageId: string,
    ownerId: string,
  ): Promise<PageRecord> {
    const restored = await pages.findByIdForOwner(pageId, ownerId);

    if (restored === null) {
      // Недостижимо: отметку сняли выше.
      throw new PageNotFoundError();
    }

    return restored;
  }
}
