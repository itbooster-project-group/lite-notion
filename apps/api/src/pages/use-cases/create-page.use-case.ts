import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { ProjectNotFoundError } from '../../projects/errors';
import { ProjectsRepository } from '../../projects/projects.repository';
import { TIPTAP_SCHEMA_VERSION } from '../constants';
import { PageParentNotFoundError, PageProjectMismatchError } from '../errors';
import { positionBetween } from '../helpers';
import { PageDocumentRepository } from '../page-document/page-document.repository';
import { type PageRecord, PagesRepository } from '../pages.repository';

export interface CreatePageCommand {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  title: string;
}

/**
 * Страница встаёт в конец уровня. Проверки идут под той же блокировкой, что и
 * вставка: снаружи они устареют, а тройной FK про `deletedAt` не знает.
 */
@Injectable()
export class CreatePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(ProjectsRepository) private readonly projects: ProjectsRepository,
    @Inject(PageDocumentRepository) private readonly documents: PageDocumentRepository,
  ) {}

  execute(command: CreatePageCommand): Promise<PageRecord> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(command.ownerId));
      const pages = this.pages.bind(scope);

      // Проект проверяется всегда: иначе код ответа выдал бы существование чужого.
      const project = await this.projects
        .bind(scope)
        .findByIdForOwner(command.projectId, command.ownerId);

      if (project === null) {
        throw new ProjectNotFoundError();
      }

      if (command.parentPageId !== null) {
        const parent = await pages.findByIdForOwner(command.parentPageId, command.ownerId);

        if (parent === null) {
          throw new PageParentNotFoundError();
        }

        if (parent.projectId !== command.projectId) {
          throw new PageProjectMismatchError();
        }
      }

      const last = await pages.findLastPositionAtLevel({
        ownerId: command.ownerId,
        parentPageId: command.parentPageId,
        projectId: command.projectId,
      });

      const page = await pages.insert({
        createdById: command.ownerId,
        ownerId: command.ownerId,
        parentPageId: command.parentPageId,
        position: positionBetween(last, null),
        projectId: command.projectId,
        title: command.title,
      });

      // Той же транзакцией: связь 1..1 обязана выполняться с первой строки.
      await this.documents.bind(scope).insertEmpty(page.id, TIPTAP_SCHEMA_VERSION);

      return page;
    });
  }
}
