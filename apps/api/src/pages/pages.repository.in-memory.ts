import { randomUUID } from 'node:crypto';

import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  SiblingParentMismatchError,
} from './errors';
import { positionBetween } from './helpers';
import type { Bytes, CreatePageInput, MovePageInput, PageRecord } from './pages.repository';
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
 * Тестовая реализация. Воспроизводит наблюдаемый контракт Prisma-версии: фильтр
 * удалённых, изоляцию по владельцу, совпадение проекта, запрет цикла, порядок
 * братьев и атомарность создания страницы вместе с документом.
 *
 * Advisory lock здесь не нужен: однопоточность JavaScript уже сериализует
 * перемещения, а роль блокировки в Prisma-версии — не дать двум транзакциям
 * увидеть дерево до чужой записи.
 */
export class InMemoryPagesRepository extends PagesRepository {
  readonly pages = new Map<string, PageRecord & { deletedAt: Date | null }>();

  /** Позволяет тесту уронить запись после смены родителя, не трогая Prisma. */
  failAfterReparent = false;

  /** Позволяет тесту уронить создание документа, не трогая Prisma. */
  failDocumentInsert = false;

  /** Хранилище документов передаётся снаружи — см. `StoredDocument`. */
  constructor(readonly documents: Map<string, StoredDocument> = new Map()) {
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
    const siblings = this.siblingsOf(input.ownerId, input.projectId, input.parentPageId);
    const last = siblings.at(-1);

    const page = {
      createdAt: new Date(),
      createdById: input.createdById,
      deletedAt: null,
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
    const previous = this.readSibling(page, input.parentPageId, input.previousSiblingId);
    const next = this.readSibling(page, input.parentPageId, input.nextSiblingId);

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

  private visible(): (PageRecord & { deletedAt: Date | null })[] {
    return [...this.pages.values()].filter((page) => page.deletedAt === null);
  }

  private toRecord(page: PageRecord & { deletedAt: Date | null }): PageRecord {
    const { deletedAt: _deletedAt, ...record } = page;

    return { ...record };
  }
}
