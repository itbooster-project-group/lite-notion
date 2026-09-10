import { PageRole } from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import {
  NextSiblingNotFoundError,
  PageCycleError,
  PageNotFoundError,
  PageParentNotFoundError,
  PageProjectMismatchError,
  PreviousSiblingNotFoundError,
  SiblingOrderError,
  SiblingParentMismatchError,
  SiblingsNotAdjacentError,
} from '../errors';

/** Идентификатор соседа из тела запроса: он же попадает в текст ошибки. */
type SiblingSlot = 'previousSiblingId' | 'nextSiblingId';

import { positionBetween } from '../helpers';
import { type PageRecord, PagesRepository } from '../pages.repository';

export interface MovePageCommand {
  actorId: string;
  pageId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

/**
 * Перемещение страницы: смена родителя и вычисление ранга. Проверки владельца,
 * цикла и соседей идут под той же блокировкой, что и запись.
 */
@Injectable()
export class MovePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository)
    private readonly permissions: PagePermissionsRepository,
  ) {}

  /**
   * Перемещение меняет границы наследования сразу для трёх поддеревьев — исходного
   * родителя, целевого и самой страницы, — поэтому требует роли `owner` на всех
   * трёх. Роль `owner` есть только у хозяина дерева, так что проверка сводится к
   * нему; выражена она через ту же модель, чтобы открыть перемещение редакторам
   * можно было сменой требуемой роли, а не переписыванием юзкейса.
   */
  execute(command: MovePageCommand): Promise<PageRecord> {
    return this.transactions.run(async (scope) => {
      const permissions = this.permissions.bind(scope);

      assertRole(await permissions.resolveRole(command.actorId, command.pageId), PageRole.OWNER);

      // Роль `owner` модель возвращает только когда актор и есть владелец страницы,
      // поэтому ключ блокировки — он сам, и лишнее чтение ради ownerId не нужно.
      await scope.lock(ownerLock(command.actorId));

      const pages = this.pages.bind(scope);
      const page = await pages.findByIdForOwner(command.pageId, command.actorId);

      if (page === null) {
        throw new PageNotFoundError();
      }

      // Права на прежнего родителя: страница уходит из его поддерева.
      if (page.parentPageId !== null) {
        assertRole(
          await permissions.resolveRole(command.actorId, page.parentPageId),
          PageRole.OWNER,
        );
      }

      if (command.parentPageId !== null) {
        const parentRole = await permissions.resolveRole(command.actorId, command.parentPageId);

        // Недоступный родитель — это отказ о родителе, а не о перемещаемой странице:
        // в теле запроса несколько идентификаторов, и вызывающий должен понять, какой
        // не подошёл. Роль ниже `owner` при этом остаётся `403`.
        if (parentRole === null) {
          throw new PageParentNotFoundError();
        }

        assertRole(parentRole, PageRole.OWNER);
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

    const previous = await this.readSibling(
      pages,
      page,
      command.parentPageId,
      command.previousSiblingId,
      'previousSiblingId',
    );
    const next = await this.readSibling(
      pages,
      page,
      command.parentPageId,
      command.nextSiblingId,
      'nextSiblingId',
    );

    if (previous !== null && next !== null) {
      // Строго по рангу, а не по порядку братьев: равные ранги щели не образуют,
      // и генератор упал бы на них внутренней ошибкой.
      if (previous.position >= next.position) {
        throw new SiblingOrderError();
      }

      // Соседства мало проверить порядком: между ними может стоять третий брат, и
      // тогда «ровно между указанными» невыполнимо, а ранг лёг бы рядом с ним.
      const between = await pages.countSiblingsBetween({
        excludedId: page.id,
        next,
        ownerId: page.ownerId,
        parentPageId: command.parentPageId,
        previous,
        projectId: page.projectId,
      });

      if (between > 0) {
        throw new SiblingsNotAdjacentError();
      }
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

    return positionBetween(previous?.position ?? null, next?.position ?? null);
  }

  private async readSibling(
    pages: PagesRepository,
    page: PageRecord,
    parentPageId: string | null,
    siblingId: string | null,
    slot: SiblingSlot,
  ): Promise<{ id: string; position: string } | null> {
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

    return { id: siblingId, position: sibling.position };
  }
}
