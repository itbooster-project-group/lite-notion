import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  PageCycleError,
  PageNotFoundError,
  PageProjectMismatchError,
  SiblingParentMismatchError,
} from './errors';
import { positionBetween } from './helpers';

/** Клиент внутри `$transaction`: те же модели, но без вложенных транзакций. */
type TransactionClient = Prisma.TransactionClient;

/**
 * Prisma отдаёт и принимает колонку `Bytes` как Uint8Array поверх обычного
 * ArrayBuffer. Объявлено здесь, потому что страница создаёт пустой документ;
 * чтение и запись содержимого живут в подмодуле `page-document`.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface PageRecord {
  id: string;
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  position: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePageInput {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  tiptapSchemaVersion: number;
}

export interface MovePageInput {
  pageId: string;
  ownerId: string;
  parentPageId: string | null;
  previousSiblingId: string | null;
  nextSiblingId: string | null;
}

const PAGE_FIELDS = {
  createdAt: true,
  createdById: true,
  id: true,
  ownerId: true,
  parentPageId: true,
  position: true,
  projectId: true,
  title: true,
  updatedAt: true,
} as const;

/**
 * Узкий доступ к дереву страниц. Абстрактный класс, а не интерфейс: он же служит
 * DI-токеном, и тесты подставляют вместо него in-memory реализацию.
 *
 * Каждый метод принимает `ownerId` и фильтрует по нему вместе с `deletedAt: null`.
 * Метода «найти страницу по id без владельца» здесь нет намеренно.
 *
 * Репозиторий не покидает модуль: снаружи с деревом работают только через
 * `PagesService`, где лежат бизнес-правила. Содержимое документа сюда не
 * относится — им владеет `PageDocumentRepository`.
 */
@Injectable()
export abstract class PagesRepository {
  abstract findAllByOwner(ownerId: string): Promise<PageRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null>;

  abstract create(input: CreatePageInput): Promise<PageRecord>;

  abstract rename(id: string, ownerId: string, title: string): Promise<PageRecord | null>;

  abstract move(input: MovePageInput): Promise<PageRecord>;
}

@Injectable()
export class PrismaPagesRepository extends PagesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  findAllByOwner(ownerId: string): Promise<PageRecord[]> {
    // Плоский список: вложенность собирает сервис. Рекурсивный CTE выбрал бы те
    // же строки, но не избавил бы от сборки дерева в приложении.
    return this.prisma.page.findMany({
      orderBy: [{ parentPageId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      select: PAGE_FIELDS,
      where: { deletedAt: null, ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null> {
    return this.prisma.page.findFirst({
      select: PAGE_FIELDS,
      where: { deletedAt: null, id, ownerId },
    });
  }

  async create(input: CreatePageInput): Promise<PageRecord> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.page.findFirst({
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
        where: {
          deletedAt: null,
          ownerId: input.ownerId,
          parentPageId: input.parentPageId,
          projectId: input.projectId,
        },
      });

      const page = await tx.page.create({
        data: {
          createdById: input.createdById,
          ownerId: input.ownerId,
          parentPageId: input.parentPageId,
          position: positionBetween(last?.position ?? null, null),
          projectId: input.projectId,
          title: input.title,
        },
        select: PAGE_FIELDS,
      });

      // Документ создаётся в той же транзакции: связь 1..1 должна выполняться с
      // первой строки, иначе чтение документа пришлось бы делать ленивым.
      await tx.pageDocument.create({
        data: {
          pageId: page.id,
          tiptapSchemaVersion: input.tiptapSchemaVersion,
          yjsState: new Uint8Array(),
        },
      });

      return page;
    });
  }

  async rename(id: string, ownerId: string, title: string): Promise<PageRecord | null> {
    const { count } = await this.prisma.page.updateMany({
      data: { title },
      where: { deletedAt: null, id, ownerId },
    });

    return count === 0 ? null : this.findByIdForOwner(id, ownerId);
  }

  async move(input: MovePageInput): Promise<PageRecord> {
    return this.prisma.$transaction(async (tx) => {
      // Первой операцией и до любого чтения: две транзакции, взявшие строчные
      // блокировки до advisory lock, получили бы deadlock. Блокировка снимается
      // вместе с транзакцией и берётся только на перемещение.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.pageId}))`;

      const page = await tx.page.findFirst({
        select: PAGE_FIELDS,
        where: { deletedAt: null, id: input.pageId, ownerId: input.ownerId },
      });

      if (page === null) {
        throw new PageNotFoundError();
      }

      if (input.parentPageId !== null) {
        await this.assertParentAccepts(tx, page, input.parentPageId);
      }

      const position = await this.resolvePosition(tx, page, input);

      return tx.page.update({
        // projectId и ownerId не обновляются: тройной FK всё равно отверг бы
        // смену, не согласованную со всем поддеревом.
        data: { parentPageId: input.parentPageId, position },
        select: PAGE_FIELDS,
        where: { id: page.id },
      });
    });
  }

  /**
   * Новый родитель должен принадлежать тому же владельцу, лежать в том же
   * проекте и не быть потомком перемещаемой страницы. Подъём по предкам делается
   * рекурсивным CTE внутри той же транзакции, что и запись.
   */
  private async assertParentAccepts(
    tx: TransactionClient,
    page: PageRecord,
    parentPageId: string,
  ): Promise<void> {
    if (parentPageId === page.id) {
      throw new PageCycleError();
    }

    const parent = await tx.page.findFirst({
      select: { id: true, projectId: true },
      where: { deletedAt: null, id: parentPageId, ownerId: page.ownerId },
    });

    if (parent === null) {
      throw new PageNotFoundError();
    }

    if (parent.projectId !== page.projectId) {
      throw new PageProjectMismatchError();
    }

    const ancestors = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT "id", "parentPageId" FROM "Page" WHERE "id" = ${parentPageId}::uuid
        UNION ALL
        SELECT parent."id", parent."parentPageId"
        FROM "Page" parent
        JOIN ancestors child ON child."parentPageId" = parent."id"
      )
      SELECT "id" FROM ancestors WHERE "id" = ${page.id}::uuid
    `;

    if (ancestors.length > 0) {
      throw new PageCycleError();
    }
  }

  /** Соседи задают щель; их ранги читаются в той же транзакции, что и запись. */
  private async resolvePosition(
    tx: TransactionClient,
    page: PageRecord,
    input: MovePageInput,
  ): Promise<string> {
    const previous = await this.readSibling(tx, page, input.parentPageId, input.previousSiblingId);
    const next = await this.readSibling(tx, page, input.parentPageId, input.nextSiblingId);

    if (previous === null && next === null) {
      const last = await tx.page.findFirst({
        orderBy: [{ position: 'desc' }, { id: 'desc' }],
        select: { position: true },
        where: {
          deletedAt: null,
          id: { not: page.id },
          ownerId: page.ownerId,
          parentPageId: input.parentPageId,
          projectId: page.projectId,
        },
      });

      return positionBetween(last?.position ?? null, null);
    }

    return positionBetween(previous?.position ?? null, next?.position ?? null);
  }

  private async readSibling(
    tx: TransactionClient,
    page: PageRecord,
    parentPageId: string | null,
    siblingId: string | null,
  ): Promise<{ position: string } | null> {
    if (siblingId === null) {
      return null;
    }

    const sibling = await tx.page.findFirst({
      select: { parentPageId: true, position: true },
      where: { deletedAt: null, id: siblingId, ownerId: page.ownerId },
    });

    if (sibling === null) {
      throw new PageNotFoundError();
    }

    if (sibling.parentPageId !== parentPageId) {
      throw new SiblingParentMismatchError();
    }

    return { position: sibling.position };
  }
}
