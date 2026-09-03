import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import {
  NextSiblingNotFoundError,
  PageCycleError,
  PageNotFoundError,
  PageParentNotFoundError,
  PageProjectMismatchError,
  PreviousSiblingNotFoundError,
  SiblingOrderError,
  SiblingParentMismatchError,
} from '../errors';

/** Идентификатор соседа из тела запроса: он же попадает в текст ошибки. */
type SiblingSlot = 'previousSiblingId' | 'nextSiblingId';

import { positionBetween } from '../helpers';
import { type PageRecord, PagesRepository } from '../pages.repository';

export interface MovePageCommand {
  ownerId: string;
  pageId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

/**
 * Перемещение страницы: смена родителя и вычисление ранга. Проверки владельца,
 * цикла и соседей идут под теми же блокировками, что и запись; ключ уровня
 * известен только после чтения страницы.
 */
@Injectable()
export class MovePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(command: MovePageCommand): Promise<PageRecord> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(command.ownerId));

      const pages = this.pages.bind(scope);
      const page = await pages.findByIdForOwner(command.pageId, command.ownerId);

      if (page === null) {
        throw new PageNotFoundError();
      }

      if (command.parentPageId !== null) {
        await this.assertParentAccepts(pages, page, command.parentPageId);
      }

      const position = await this.resolvePosition(pages, page, command);

      return pages.reparent(page.id, command.parentPageId, position);
    });
  }

  private async assertParentAccepts(
    pages: PagesRepository,
    page: PageRecord,
    parentPageId: string,
  ): Promise<void> {
    if (parentPageId === page.id) {
      throw new PageCycleError();
    }

    const parent = await pages.findByIdForOwner(parentPageId, page.ownerId);

    if (parent === null) {
      throw new PageParentNotFoundError();
    }

    if (parent.projectId !== page.projectId) {
      throw new PageProjectMismatchError();
    }

    if ((await pages.findAncestorIds(parentPageId)).includes(page.id)) {
      throw new PageCycleError();
    }
  }

  private async resolvePosition(
    pages: PagesRepository,
    page: PageRecord,
    command: MovePageCommand,
  ): Promise<string> {
    if (command.previousSiblingId !== null && command.previousSiblingId === command.nextSiblingId) {
      throw new SiblingOrderError();
    }

    const previous = await this.readSiblingPosition(
      pages,
      page,
      command.parentPageId,
      command.previousSiblingId,
      'previousSiblingId',
    );
    const next = await this.readSiblingPosition(
      pages,
      page,
      command.parentPageId,
      command.nextSiblingId,
      'nextSiblingId',
    );

    // Щель должна существовать: иначе генератор ранга упал бы внутренней ошибкой.
    if (previous !== null && next !== null && previous >= next) {
      throw new SiblingOrderError();
    }

    if (previous === null && next === null) {
      const last = await pages.findLastPositionAtLevel({
        excludedId: page.id,
        ownerId: page.ownerId,
        parentPageId: command.parentPageId,
        projectId: page.projectId,
      });

      return positionBetween(last, null);
    }

    return positionBetween(previous, next);
  }

  private async readSiblingPosition(
    pages: PagesRepository,
    page: PageRecord,
    parentPageId: string | null,
    siblingId: string | null,
    slot: SiblingSlot,
  ): Promise<string | null> {
    if (siblingId === null) {
      return null;
    }

    const sibling = await pages.findSiblingForOwner(siblingId, page.projectId, page.ownerId);

    if (sibling === null) {
      throw slot === 'previousSiblingId'
        ? new PreviousSiblingNotFoundError()
        : new NextSiblingNotFoundError();
    }

    if (sibling.parentPageId !== parentPageId) {
      throw new SiblingParentMismatchError(slot);
    }

    return sibling.position;
  }
}
