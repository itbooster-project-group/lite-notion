import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';
import { PageDeletionOrigin } from '../generated/prisma/enums';

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

export interface DeletedPageRecord extends PageRecord {
  deletedAt: Date;
  deletedOrigin: PageDeletionOrigin;
}

export interface InsertPageInput {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  position: string;
}

/** Уровень дерева: страницы одного проекта под одним родителем. */
export interface SiblingLevel {
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  /** Исключается из выборки: перемещаемая страница не сравнивается сама с собой. */
  excludedId?: string;
}

export interface SiblingRecord {
  parentPageId: string | null;
  position: string;
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

const DELETED_PAGE_FIELDS = { ...PAGE_FIELDS, deletedAt: true, deletedOrigin: true } as const;

/**
 * Доступ к таблице страниц. Абстрактный класс служит DI-токеном; тесты подставляют
 * in-memory реализацию. Решений здесь нет — они в юзкейсах модуля.
 *
 * Метода «найти страницу по id без владельца» нет намеренно.
 */
@Injectable()
export abstract class PagesRepository {
  /**
   * Копия репозитория на соединении транзакции. Новый экземпляр, а не мутация:
   * провайдер Nest — синглтон, и мутация увела бы чужой запрос в эту транзакцию.
   */
  abstract bind(scope: TransactionScope): PagesRepository;

  abstract findAllByOwner(ownerId: string): Promise<PageRecord[]>;

  abstract findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null>;

  abstract insert(input: InsertPageInput): Promise<PageRecord>;

  /** Ранг последней страницы уровня. `null`, когда уровень пуст. */
  abstract findLastPositionAtLevel(level: SiblingLevel): Promise<string | null>;

  abstract rename(id: string, ownerId: string, title: string): Promise<PageRecord | null>;

  /**
   * Идентификаторы всех предков узла, включая его самого. Подъём по дереву —
   * рекурсивный CTE в базе; решение о цикле принимает вызывающий.
   */
  abstract findAncestorIds(pageId: string): Promise<string[]>;

  /** `null`, когда соседа нет, он в другом проекте или чужой. */
  abstract findSiblingForOwner(
    siblingId: string,
    projectId: string,
    ownerId: string,
  ): Promise<SiblingRecord | null>;

  /**
   * Меняет родителя и ранг. `projectId` и `ownerId` не обновляются: тройной FK
   * всё равно отверг бы смену, не согласованную со всем поддеревом.
   */
  abstract reparent(id: string, parentPageId: string | null, position: string): Promise<PageRecord>;

  /** Все удалённые страницы владельца, без исключений по источнику. */
  abstract findDeletedByOwner(ownerId: string): Promise<DeletedPageRecord[]>;

  /** Помечает страницу и её живое поддерево. `0` — страницы нет, она чужая или удалена. */
  abstract markSubtreeDeleted(id: string, ownerId: string, deletedAt: Date): Promise<number>;

  /** Удалённая страница владельца. `null`, когда она жива, чужая или не существует. */
  abstract findDeletedForOwner(id: string, ownerId: string): Promise<DeletedPageRecord | null>;

  /**
   * Переносит физическое поддерево в другой проект одним statement'ом: тройной FK с
   * `onUpdate: NoAction` требует менять предка и потомков вместе.
   */
  abstract moveSubtreeToProject(id: string, projectId: string): Promise<void>;

  /**
   * Снимает отметку с узла и потомков, которых корзина показывала вложенными.
   * Условие спуска — «удалён не самостоятельно», а не `PARENT_PAGE`.
   */
  abstract clearSubtreeDeletion(id: string): Promise<void>;

  /**
   * Заголовки потомков, которых корзина показывала отдельными корнями. Спуск идёт по
   * всему физическому поддереву — ровно по тому, что унесёт FK-каскад.
   */
  abstract findSelfDeletedDescendantTitles(id: string): Promise<string[]>;

  /**
   * Помечает живые страницы проекта источником `PROJECT`. Уже удалённые сохраняют
   * свой источник и остаются самостоятельными корнями корзины.
   */
  abstract markProjectPagesDeleted(
    projectId: string,
    ownerId: string,
    deletedAt: Date,
  ): Promise<void>;

  /** Снимает отметку с тех страниц, которые пометило удаление этого проекта. */
  abstract clearProjectPagesDeleted(projectId: string, ownerId: string): Promise<void>;

  /**
   * Заголовки страниц перечисленных проектов, удалённых раньше самостоятельно.
   * Только `SELF` — корни корзины; их ветки нарисованы под ними.
   */
  abstract findSelfDeletedTitlesByProjects(
    projectIds: readonly string[],
    ownerId: string,
  ): Promise<string[]>;

  /** Безвозвратно удаляет страницу. Поддерево и документы уносят FK-каскады. */
  abstract deleteById(id: string): Promise<void>;

  abstract deleteAllDeletedByOwner(ownerId: string): Promise<void>;
}

@Injectable()
export class PrismaPagesRepository extends PagesRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPagesRepository {
    return new PrismaPagesRepository(databaseClientOf(scope));
  }

  findAllByOwner(ownerId: string): Promise<PageRecord[]> {
    // Плоский список: вложенность собирает сервис. Рекурсивный CTE выбрал бы те
    // же строки, но не избавил бы от сборки дерева в приложении.
    return this.client.page.findMany({
      orderBy: [{ parentPageId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      select: PAGE_FIELDS,
      where: { deletedAt: null, ownerId },
    });
  }

  findByIdForOwner(id: string, ownerId: string): Promise<PageRecord | null> {
    return this.client.page.findFirst({
      select: PAGE_FIELDS,
      where: { deletedAt: null, id, ownerId },
    });
  }

  insert(input: InsertPageInput): Promise<PageRecord> {
    return this.client.page.create({
      data: {
        createdById: input.createdById,
        ownerId: input.ownerId,
        parentPageId: input.parentPageId,
        position: input.position,
        projectId: input.projectId,
        title: input.title,
      },
      select: PAGE_FIELDS,
    });
  }

  async findLastPositionAtLevel(level: SiblingLevel): Promise<string | null> {
    const last = await this.client.page.findFirst({
      orderBy: [{ position: 'desc' }, { id: 'desc' }],
      select: { position: true },
      where: {
        deletedAt: null,
        ownerId: level.ownerId,
        parentPageId: level.parentPageId,
        projectId: level.projectId,
        ...(level.excludedId === undefined ? {} : { id: { not: level.excludedId } }),
      },
    });

    return last?.position ?? null;
  }

  async rename(id: string, ownerId: string, title: string): Promise<PageRecord | null> {
    const { count } = await this.client.page.updateMany({
      data: { title },
      where: { deletedAt: null, id, ownerId },
    });

    return count === 0 ? null : this.findByIdForOwner(id, ownerId);
  }

  async findAncestorIds(pageId: string): Promise<string[]> {
    const ancestors = await this.client.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT "id", "parentPageId" FROM "Page" WHERE "id" = ${pageId}::uuid
        UNION ALL
        SELECT parent."id", parent."parentPageId"
        FROM "Page" parent
        JOIN ancestors child ON child."parentPageId" = parent."id"
      )
      SELECT "id" FROM ancestors
    `;

    return ancestors.map((row) => row.id);
  }

  findSiblingForOwner(
    siblingId: string,
    projectId: string,
    ownerId: string,
  ): Promise<SiblingRecord | null> {
    return this.client.page.findFirst({
      select: { parentPageId: true, position: true },
      where: { deletedAt: null, id: siblingId, ownerId, projectId },
    });
  }

  reparent(id: string, parentPageId: string | null, position: string): Promise<PageRecord> {
    return this.client.page.update({
      data: { parentPageId, position },
      select: PAGE_FIELDS,
      where: { id },
    });
  }

  findDeletedByOwner(ownerId: string): Promise<DeletedPageRecord[]> {
    // Плоский список: вложенность корзины собирает сервис, и собирает он её не по
    // `parentPageId`, а по источнику удаления — см. `PagesService`.
    return this.client.page.findMany({
      orderBy: [{ deletedAt: 'desc' }, { position: 'asc' }, { id: 'asc' }],
      select: DELETED_PAGE_FIELDS,
      where: { deletedAt: { not: null }, ownerId },
    }) as Promise<DeletedPageRecord[]>;
  }

  async markSubtreeDeleted(id: string, ownerId: string, deletedAt: Date): Promise<number> {
    // Спуск не проходит сквозь уже удалённые: они остаются корнями корзины.
    return this.client.$executeRaw`
      WITH RECURSIVE subtree AS (
        SELECT "id"
        FROM "Page"
        WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
        UNION ALL
        SELECT child."id"
        FROM "Page" child
        JOIN subtree ON child."parentPageId" = subtree."id"
        WHERE child."deletedAt" IS NULL
      )
      UPDATE "Page"
      SET "deletedAt" = ${deletedAt},
          "deletedOrigin" = CASE
            WHEN "id" = ${id}::uuid THEN 'SELF'::"PageDeletionOrigin"
            ELSE 'PARENT_PAGE'::"PageDeletionOrigin"
          END
      WHERE "id" IN (SELECT "id" FROM subtree)
    `;
  }

  findDeletedForOwner(id: string, ownerId: string): Promise<DeletedPageRecord | null> {
    return this.client.page.findFirst({
      select: DELETED_PAGE_FIELDS,
      where: { deletedAt: { not: null }, id, ownerId },
    }) as Promise<DeletedPageRecord | null>;
  }

  async moveSubtreeToProject(id: string, projectId: string): Promise<void> {
    // Переносится и то, что остаётся удалённым: ребёнок не может лежать в другом
    // проекте, чем родитель.
    await this.client.$executeRaw`
      WITH RECURSIVE subtree AS (
        SELECT "id" FROM "Page" WHERE "id" = ${id}::uuid
        UNION ALL
        SELECT child."id"
        FROM "Page" child
        JOIN subtree ON child."parentPageId" = subtree."id"
      )
      UPDATE "Page"
      SET "projectId" = ${projectId}::uuid
      WHERE "id" IN (SELECT "id" FROM subtree)
    `;
  }

  async clearSubtreeDeletion(id: string): Promise<void> {
    await this.client.$executeRaw`
      WITH RECURSIVE subtree AS (
        SELECT "id" FROM "Page" WHERE "id" = ${id}::uuid
        UNION ALL
        SELECT child."id"
        FROM "Page" child
        JOIN subtree ON child."parentPageId" = subtree."id"
        WHERE child."deletedOrigin" <> 'SELF'::"PageDeletionOrigin"
      )
      UPDATE "Page"
      SET "deletedAt" = NULL, "deletedOrigin" = NULL
      WHERE "id" IN (SELECT "id" FROM subtree)
    `;
  }

  async findSelfDeletedDescendantTitles(id: string): Promise<string[]> {
    // Только `SELF`-потомки — корни корзины; их ветки нарисованы под ними.
    const doomed = await this.client.$queryRaw<{ title: string }[]>`
      WITH RECURSIVE subtree AS (
        SELECT "id", "title", "deletedOrigin" FROM "Page" WHERE "id" = ${id}::uuid
        UNION ALL
        SELECT child."id", child."title", child."deletedOrigin"
        FROM "Page" child
        JOIN subtree ON child."parentPageId" = subtree."id"
      )
      SELECT "title"
      FROM subtree
      WHERE "id" <> ${id}::uuid AND "deletedOrigin" = 'SELF'::"PageDeletionOrigin"
      ORDER BY "title" ASC, "id" ASC
    `;

    return doomed.map((row) => row.title);
  }

  async markProjectPagesDeleted(
    projectId: string,
    ownerId: string,
    deletedAt: Date,
  ): Promise<void> {
    // Рекурсия не нужна: `projectId` есть в каждой строке, дерево тут ни при чём.
    await this.client.page.updateMany({
      data: { deletedAt, deletedOrigin: PageDeletionOrigin.PROJECT },
      where: { deletedAt: null, ownerId, projectId },
    });
  }

  async clearProjectPagesDeleted(projectId: string, ownerId: string): Promise<void> {
    await this.client.page.updateMany({
      data: { deletedAt: null, deletedOrigin: null },
      where: { deletedOrigin: PageDeletionOrigin.PROJECT, ownerId, projectId },
    });
  }

  async findSelfDeletedTitlesByProjects(
    projectIds: readonly string[],
    ownerId: string,
  ): Promise<string[]> {
    const doomed = await this.client.page.findMany({
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: { title: true },
      where: {
        deletedOrigin: PageDeletionOrigin.SELF,
        ownerId,
        projectId: { in: [...projectIds] },
      },
    });

    return doomed.map((page) => page.title);
  }

  async deleteById(id: string): Promise<void> {
    await this.client.page.delete({ where: { id } });
  }

  async deleteAllDeletedByOwner(ownerId: string): Promise<void> {
    // Потомки уходят FK-каскадом — повторное удаление строки безвредно.
    await this.client.page.deleteMany({ where: { deletedAt: { not: null }, ownerId } });
  }
}
