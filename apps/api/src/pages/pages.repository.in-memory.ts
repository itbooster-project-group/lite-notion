import { randomUUID } from 'node:crypto';

import type { TransactionScope } from '../database/transaction';
import type { PageDeletionOrigin } from '../generated/prisma/enums';
import type {
  Bytes,
  DeletedPageRecord,
  InsertPageInput,
  PageRecord,
  SiblingLevel,
  SiblingRecord,
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
 * Тестовая реализация контракта Prisma-версии: фильтр удалённых, изоляция по
 * владельцу, порядок братьев, создание страницы вместе с документом. Advisory lock
 * не нужен — однопоточность JavaScript уже сериализует операции.
 */
export class InMemoryPagesRepository extends PagesRepository {
  /** Позволяет тесту уронить запись после смены родителя, не трогая Prisma. */
  failAfterReparent = false;

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

  /** Хранилище одно на все скоупы: соединения, которое выбирает `bind`, здесь нет. */
  bind(_scope: TransactionScope): InMemoryPagesRepository {
    return this;
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

  async insert(input: InsertPageInput): Promise<PageRecord> {
    const page: StoredPage = {
      createdAt: new Date(),
      createdById: input.createdById,
      deletedAt: null,
      deletedOrigin: null,
      id: randomUUID(),
      ownerId: input.ownerId,
      parentPageId: input.parentPageId,
      position: input.position,
      projectId: input.projectId,
      title: input.title,
      updatedAt: new Date(),
    };

    this.pages.set(page.id, page);

    return this.toRecord(page);
  }

  async findLastPositionAtLevel(level: SiblingLevel): Promise<string | null> {
    const siblings = this.siblingsOf(level.ownerId, level.projectId, level.parentPageId).filter(
      (page) => page.id !== level.excludedId,
    );

    return siblings.at(-1)?.position ?? null;
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

  async findAncestorIds(pageId: string): Promise<string[]> {
    const ids: string[] = [];

    for (
      let current: string | null = pageId;
      current !== null;
      current = this.pages.get(current)?.parentPageId ?? null
    ) {
      ids.push(current);
    }

    return ids;
  }

  async findSiblingForOwner(
    siblingId: string,
    projectId: string,
    ownerId: string,
  ): Promise<SiblingRecord | null> {
    const sibling = this.pages.get(siblingId);

    return sibling === undefined ||
      sibling.deletedAt !== null ||
      sibling.ownerId !== ownerId ||
      sibling.projectId !== projectId
      ? null
      : { parentPageId: sibling.parentPageId, position: sibling.position };
  }

  async reparent(id: string, parentPageId: string | null, position: string): Promise<PageRecord> {
    const page = this.pages.get(id);

    if (page === undefined) {
      throw new Error(`Page ${id} is gone`);
    }

    if (this.failAfterReparent) {
      // Ни родитель, ни ранг не записаны: в Prisma-версии оба поля меняет один
      // UPDATE внутри транзакции, поэтому промежуточного состояния не бывает.
      throw new Error('move failed before persisting the new position');
    }

    page.parentPageId = parentPageId;
    page.position = position;
    page.updatedAt = new Date();

    return this.toRecord(page);
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

  async markSubtreeDeleted(id: string, ownerId: string, deletedAt: Date): Promise<number> {
    const page = this.pages.get(id);

    if (page === undefined || page.deletedAt !== null || page.ownerId !== ownerId) {
      return 0;
    }

    page.deletedAt = deletedAt;
    page.deletedOrigin = 'SELF';

    // Спуск обрывается на уже удалённых: их поддеревья помечены раньше, и
    // перемечать их нельзя — они остаются самостоятельными корнями корзины.
    const descendants = this.liveDescendantsOf(id);

    for (const descendant of descendants) {
      descendant.deletedAt = deletedAt;
      descendant.deletedOrigin = 'PARENT_PAGE';
    }

    return descendants.length + 1;
  }

  async findDeletedForOwner(id: string, ownerId: string): Promise<DeletedPageRecord | null> {
    const page = this.pages.get(id);

    return page === undefined || page.deletedAt === null || page.ownerId !== ownerId
      ? null
      : {
          ...this.toRecord(page),
          deletedAt: page.deletedAt,
          deletedOrigin: page.deletedOrigin as PageDeletionOrigin,
        };
  }

  async moveSubtreeToProject(id: string, projectId: string): Promise<void> {
    const page = this.pages.get(id);

    if (page === undefined) {
      return;
    }

    // Всё физическое поддерево меняет проект, включая то, что остаётся
    // удалённым: ребёнок не может лежать в одном проекте с родителем в другом.
    for (const node of [page, ...this.descendantsOf(id, () => true)]) {
      node.projectId = projectId;
    }
  }

  async clearSubtreeDeletion(id: string): Promise<void> {
    const page = this.pages.get(id);

    if (page === undefined) {
      return;
    }

    page.deletedAt = null;
    page.deletedOrigin = null;

    for (const descendant of this.cascadeDeletedDescendantsOf(id)) {
      descendant.deletedAt = null;
      descendant.deletedOrigin = null;
    }
  }

  async findSelfDeletedDescendantTitles(id: string): Promise<string[]> {
    // Спуск по всему физическому поддереву — ровно то, что унесёт FK-каскад.
    return this.descendantsOf(id, () => true)
      .filter((descendant) => descendant.deletedOrigin === 'SELF')
      .map((descendant) => descendant.title)
      .sort();
  }

  async markProjectPagesDeleted(
    projectId: string,
    ownerId: string,
    deletedAt: Date,
  ): Promise<void> {
    for (const page of this.pages.values()) {
      if (page.projectId === projectId && page.ownerId === ownerId && page.deletedAt === null) {
        page.deletedAt = deletedAt;
        page.deletedOrigin = 'PROJECT';
      }
    }
  }

  async clearProjectPagesDeleted(projectId: string, ownerId: string): Promise<void> {
    for (const page of this.pages.values()) {
      if (
        page.projectId === projectId &&
        page.ownerId === ownerId &&
        page.deletedOrigin === 'PROJECT'
      ) {
        page.deletedAt = null;
        page.deletedOrigin = null;
      }
    }
  }

  async findSelfDeletedTitlesByProjects(
    projectIds: readonly string[],
    ownerId: string,
  ): Promise<string[]> {
    return [...this.pages.values()]
      .filter(
        (page) =>
          page.ownerId === ownerId &&
          projectIds.includes(page.projectId) &&
          page.deletedOrigin === 'SELF',
      )
      .map((page) => page.title)
      .sort();
  }

  async deleteById(id: string): Promise<void> {
    for (const descendant of this.descendantsOf(id, () => true)) {
      this.pages.delete(descendant.id);
      this.documents.delete(descendant.id);
    }

    this.pages.delete(id);
    this.documents.delete(id);
  }

  async deleteAllDeletedByOwner(ownerId: string): Promise<void> {
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
