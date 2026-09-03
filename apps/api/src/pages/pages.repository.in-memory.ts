import { randomUUID } from 'node:crypto';

import { PurgeConfirmationRequiredError } from '../common/errors';
import type { PageDeletionOrigin } from '../generated/prisma/enums';
import { ProjectNotFoundError } from '../projects/errors';
import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  PageRestoreProjectDeletedError,
  PageRestoreTargetProjectRejectedError,
  SiblingOrderError,
  SiblingParentMismatchError,
} from './errors';
import { positionBetween } from './helpers';
import type {
  Bytes,
  CreatePageInput,
  DeletedPageRecord,
  MovePageInput,
  PageRecord,
} from './pages.repository';
import { PagesRepository } from './pages.repository';

/**
 * Одна строка таблицы документов. Хранилище общее с
 * `InMemoryPageDocumentRepository`: в базе это одна таблица, и тест, который
 * создал страницу, обязан увидеть её документ через репозиторий документа.
 */
export interface StoredDocument {
  tiptapSchemaVersion: number;
  yjsState: Bytes;
  storageRevision: number;
}

/**
 * Строка таблицы страниц. `deletedAt` и `deletedOrigin` — пара, как и в базе:
 * оба null либо оба заполнены. CHECK-constraint здесь не воспроизвести, поэтому
 * инвариант держат методы, которые их проставляют.
 */
export interface StoredPage extends PageRecord {
  deletedAt: Date | null;
  deletedOrigin: PageDeletionOrigin | null;
}

/**
 * Минимальная форма строки проекта, которой достаточно восстановлению страницы.
 * Проект, которого нет в хранилище, считается живым: тесты, не работающие с
 * проектами, не обязаны их заводить, а в базе такой страницы не бывает — её не
 * пустил бы FK.
 */
export interface DeletableProject {
  ownerId: string;
  deletedAt: Date | null;
}

/**
 * Тестовая реализация. Воспроизводит наблюдаемый контракт Prisma-версии: фильтр
 * удалённых, изоляцию по владельцу, совпадение проекта, запрет цикла, порядок
 * братьев и атомарность создания страницы вместе с документом.
 *
 * Advisory lock здесь не нужен: однопоточность JavaScript уже сериализует
 * перемещения, а роль блокировки в Prisma-версии — не дать двум транзакциям
 * увидеть дерево до чужой записи.
 */
export class InMemoryPagesRepository extends PagesRepository {
  /** Позволяет тесту уронить запись после смены родителя, не трогая Prisma. */
  failAfterReparent = false;

  /** Позволяет тесту уронить создание документа, не трогая Prisma. */
  failDocumentInsert = false;

  /**
   * Хранилища передаются снаружи: в базе это отдельные таблицы, и тест, который
   * удалил проект, обязан увидеть последствия через репозиторий страниц.
   */
  constructor(
    readonly documents: Map<string, StoredDocument> = new Map(),
    readonly projects: Map<string, DeletableProject> = new Map(),
    readonly pages: Map<string, StoredPage> = new Map(),
  ) {
    super();
  }

  async findAllByOwner(ownerId: string): Promise<PageRecord[]> {
    return this.visible()
      .filter((page) => page.ownerId === ownerId)
      .sort(
        (left, right) =>
          (left.parentPageId ?? '').localeCompare(right.parentPageId ?? '') ||
          left.position.localeCompare(right.position) ||
          left.id.localeCompare(right.id),
      )
      .map((page) => this.toRecord(page));
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null> {
    const page = this.pages.get(id);

    return page === undefined || page.deletedAt !== null || page.ownerId !== ownerId
      ? null
      : this.toRecord(page);
  }

  async create(input: CreatePageInput): Promise<PageRecord> {
    // Однопоточность JavaScript уже сериализует создание, но контракт тот же, что
    // у Prisma-версии: удалённый проект и удалённый родитель отвергаются.
    const project = this.projects.get(input.projectId);

    if (project !== undefined && project.deletedAt !== null) {
      throw new ProjectNotFoundError();
    }

    if (input.parentPageId !== null && this.pages.get(input.parentPageId)?.deletedAt != null) {
      throw new PageNotFoundError();
    }

    const siblings = this.siblingsOf(input.ownerId, input.projectId, input.parentPageId);
    const last = siblings.at(-1);

    const page: StoredPage = {
      createdAt: new Date(),
      createdById: input.createdById,
      deletedAt: null,
      deletedOrigin: null,
      id: randomUUID(),
      ownerId: input.ownerId,
      parentPageId: input.parentPageId,
      position: positionBetween(last?.position ?? null, null),
      projectId: input.projectId,
      title: input.title,
      updatedAt: new Date(),
    };

    if (this.failDocumentInsert) {
      // Страница не публикуется: в Prisma-версии её откатывает транзакция.
      throw new Error('document insert failed');
    }

    this.pages.set(page.id, page);
    this.documents.set(page.id, {
      storageRevision: 0,
      tiptapSchemaVersion: input.tiptapSchemaVersion,
      yjsState: new Uint8Array(),
    });

    return this.toRecord(page);
  }

  async rename(id: string, ownerId: string, title: string): Promise<PageRecord | null> {
    const page = this.pages.get(id);

    if (page === undefined || page.deletedAt !== null || page.ownerId !== ownerId) {
      return null;
    }

    page.title = title;
    page.updatedAt = new Date();

    return this.toRecord(page);
  }

  async move(input: MovePageInput): Promise<PageRecord> {
    const page = this.pages.get(input.pageId);

    if (page === undefined || page.deletedAt !== null || page.ownerId !== input.ownerId) {
      throw new PageNotFoundError();
    }

    if (input.parentPageId !== null) {
      this.assertParentAccepts(page, input.parentPageId);
    }

    const position = this.resolvePosition(page, input);

    if (this.failAfterReparent) {
      // Ни родитель, ни ранг не записаны: в Prisma-версии оба поля меняет один
      // UPDATE внутри транзакции, поэтому промежуточного состояния не бывает.
      throw new Error('move failed before persisting the new position');
    }

    page.parentPageId = input.parentPageId;
    page.position = position;
    page.updatedAt = new Date();

    return this.toRecord(page);
  }

  private assertParentAccepts(page: PageRecord, parentPageId: string): void {
    if (parentPageId === page.id) {
      throw new PageCycleError();
    }

    const parent = this.pages.get(parentPageId);

    if (parent === undefined || parent.deletedAt !== null || parent.ownerId !== page.ownerId) {
      throw new PageNotFoundError();
    }

    if (parent.projectId !== page.projectId) {
      throw new PageProjectMismatchError();
    }

    for (
      let ancestor: string | null = parent.parentPageId;
      ancestor !== null;
      ancestor = this.pages.get(ancestor)?.parentPageId ?? null
    ) {
      if (ancestor === page.id) {
        throw new PageCycleError();
      }
    }
  }

  private resolvePosition(page: PageRecord, input: MovePageInput): string {
    if (input.previousSiblingId !== null && input.previousSiblingId === input.nextSiblingId) {
      throw new SiblingOrderError();
    }

    const previous = this.readSibling(page, input.parentPageId, input.previousSiblingId);
    const next = this.readSibling(page, input.parentPageId, input.nextSiblingId);

    if (previous !== null && next !== null && previous.position >= next.position) {
      throw new SiblingOrderError();
    }

    if (previous === null && next === null) {
      const last = this.siblingsOf(page.ownerId, page.projectId, input.parentPageId)
        .filter((sibling) => sibling.id !== page.id)
        .at(-1);

      return positionBetween(last?.position ?? null, null);
    }

    return positionBetween(previous?.position ?? null, next?.position ?? null);
  }

  private readSibling(
    page: PageRecord,
    parentPageId: string | null,
    siblingId: string | null,
  ): { position: string } | null {
    if (siblingId === null) {
      return null;
    }

    const sibling = this.pages.get(siblingId);

    if (sibling === undefined || sibling.deletedAt !== null || sibling.ownerId !== page.ownerId) {
      throw new PageNotFoundError();
    }

    if (sibling.parentPageId !== parentPageId) {
      throw new SiblingParentMismatchError();
    }

    return { position: sibling.position };
  }

  private siblingsOf(
    ownerId: string,
    projectId: string,
    parentPageId: string | null,
  ): PageRecord[] {
    return this.visible()
      .filter(
        (page) =>
          page.ownerId === ownerId &&
          page.projectId === projectId &&
          page.parentPageId === parentPageId,
      )
      .sort(
        (left, right) =>
          left.position.localeCompare(right.position) || left.id.localeCompare(right.id),
      );
  }

  private visible(): StoredPage[] {
    return [...this.pages.values()].filter((page) => page.deletedAt === null);
  }

  private toRecord(page: StoredPage): PageRecord {
    const { deletedAt: _deletedAt, deletedOrigin: _deletedOrigin, ...record } = page;

    return { ...record };
  }

  async findDeletedByOwner(ownerId: string): Promise<DeletedPageRecord[]> {
    return [...this.pages.values()]
      .filter((page) => page.deletedAt !== null && page.ownerId === ownerId)
      .sort(
        (left, right) =>
          (right.deletedAt?.getTime() ?? 0) - (left.deletedAt?.getTime() ?? 0) ||
          left.position.localeCompare(right.position) ||
          left.id.localeCompare(right.id),
      )
      .map((page) => ({
        ...this.toRecord(page),
        deletedAt: page.deletedAt as Date,
        deletedOrigin: page.deletedOrigin as PageDeletionOrigin,
      }));
  }

  async softDelete(id: string, ownerId: string): Promise<boolean> {
    const page = this.pages.get(id);

    if (page === undefined || page.deletedAt !== null || page.ownerId !== ownerId) {
      return false;
    }

    // Одна отметка на всё поддерево — по ней потом отсчитывается срок хранения.
    const deletedAt = new Date();

    page.deletedAt = deletedAt;
    page.deletedOrigin = 'SELF';

    // Спуск обрывается на уже удалённых: их поддеревья помечены раньше, и
    // перемечать их нельзя — они остаются самостоятельными корнями корзины.
    for (const descendant of this.liveDescendantsOf(id)) {
      descendant.deletedAt = deletedAt;
      descendant.deletedOrigin = 'PARENT_PAGE';
    }

    return true;
  }

  async restore(id: string, ownerId: string, targetProjectId: string | null): Promise<PageRecord> {
    const page = this.pages.get(id);

    if (page === undefined || page.deletedAt === null || page.ownerId !== ownerId) {
      throw new PageNotFoundError();
    }

    const destinationProjectId = this.resolveDestinationProject(page, targetProjectId);
    const movesProject = destinationProjectId !== page.projectId;

    // Всё физическое поддерево меняет проект, включая то, что остаётся
    // удалённым: ребёнок не может лежать в одном проекте с родителем в другом.
    if (movesProject) {
      for (const node of [page, ...this.descendantsOf(id, () => true)]) {
        node.projectId = destinationProjectId;
      }
    }

    const parent = page.parentPageId === null ? undefined : this.pages.get(page.parentPageId);
    const raises = movesProject || (page.parentPageId !== null && parent?.deletedAt !== null);

    page.deletedAt = null;
    page.deletedOrigin = null;

    for (const descendant of this.cascadeDeletedDescendantsOf(id)) {
      descendant.deletedAt = null;
      descendant.deletedOrigin = null;
    }

    if (raises) {
      const last = this.siblingsOf(page.ownerId, destinationProjectId, null)
        .filter((sibling) => sibling.id !== page.id)
        .at(-1);

      page.parentPageId = null;
      page.position = positionBetween(last?.position ?? null, null);
    }

    return this.toRecord(page);
  }

  private resolveDestinationProject(page: StoredPage, targetProjectId: string | null): string {
    const own = this.projects.get(page.projectId);

    if (own === undefined || own.deletedAt === null) {
      if (targetProjectId !== null && targetProjectId !== page.projectId) {
        throw new PageRestoreTargetProjectRejectedError();
      }

      return page.projectId;
    }

    if (targetProjectId === null) {
      throw new PageRestoreProjectDeletedError();
    }

    const target = this.projects.get(targetProjectId);

    // Владелец проверяется наравне с отметкой удаления: чужой, удалённый и
    // несуществующий проект назначения обязаны быть неразличимы.
    if (target === undefined || target.deletedAt !== null || target.ownerId !== page.ownerId) {
      throw new ProjectNotFoundError();
    }

    return targetProjectId;
  }

  async purge(id: string, ownerId: string, cascade: boolean): Promise<void> {
    const page = this.pages.get(id);

    if (page === undefined || page.deletedAt === null || page.ownerId !== ownerId) {
      throw new PageNotFoundError();
    }

    // Спуск по всему физическому поддереву — ровно то, что унесёт FK-каскад.
    const subtree = this.descendantsOf(id, () => true);
    const doomed = subtree
      .filter((descendant) => descendant.deletedOrigin === 'SELF')
      .map((descendant) => descendant.title)
      .sort();

    if (doomed.length > 0 && !cascade) {
      throw new PurgeConfirmationRequiredError(doomed);
    }

    for (const descendant of subtree) {
      this.pages.delete(descendant.id);
      this.documents.delete(descendant.id);
    }

    this.pages.delete(id);
    this.documents.delete(id);
  }

  async purgeTrash(ownerId: string): Promise<void> {
    for (const page of [...this.pages.values()]) {
      if (page.deletedAt !== null && page.ownerId === ownerId) {
        this.pages.delete(page.id);
        this.documents.delete(page.id);
      }
    }
  }

  /** Живые потомки на любой глубине; спуск не проходит сквозь удалённые узлы. */
  private liveDescendantsOf(id: string): StoredPage[] {
    return this.descendantsOf(id, (page) => page.deletedAt === null);
  }

  /** Потомки, удалённые не самостоятельно: то, что корзина рисует вложенным. */
  private cascadeDeletedDescendantsOf(id: string): StoredPage[] {
    return this.descendantsOf(
      id,
      (page) => page.deletedAt !== null && page.deletedOrigin !== 'SELF',
    );
  }

  private descendantsOf(id: string, accepts: (page: StoredPage) => boolean): StoredPage[] {
    const collected: StoredPage[] = [];
    const queue = [id];

    while (queue.length > 0) {
      const parentId = queue.shift() as string;

      for (const page of this.pages.values()) {
        if (page.parentPageId === parentId && accepts(page)) {
          collected.push(page);
          queue.push(page.id);
        }
      }
    }

    return collected;
  }
}
