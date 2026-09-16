import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';
import { PageRole } from './constants';

/** Звено цепочки от страницы вверх. `depth` 0 — сама страница. */
export interface PageAccessChainRow {
  ownerId: string;
  depth: number;
  role: 'VIEWER' | 'EDITOR' | null;
}

/** Страница чужого дерева, доступная спрашивающему, с его ролью на ней. */
export interface AccessiblePageRow {
  id: string;
  ownerId: string;
  projectId: string;
  parentPageId: string | null;
  createdById: string;
  title: string;
  position: string;
  accessMode: 'INHERIT' | 'RESTRICTED';
  createdAt: Date;
  updatedAt: Date;
  role: PageRole;
}

interface AccessiblePageRawRow extends Omit<AccessiblePageRow, 'role'> {
  role: 'VIEWER' | 'EDITOR';
}

/** Прямое разрешение вместе с тем, кому оно выдано: список показывает людей. */
export interface PagePermissionRecord {
  pageId: string;
  userId: string;
  email: string;
  name: string;
  role: 'VIEWER' | 'EDITOR';
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPermissionInput {
  pageId: string;
  userId: string;
  role: 'VIEWER' | 'EDITOR';
  grantedById: string;
}

const PERMISSION_FIELDS = {
  createdAt: true,
  pageId: true,
  role: true,
  updatedAt: true,
  user: { select: { email: true, name: true } },
  userId: true,
} as const;

interface PermissionRow {
  pageId: string;
  userId: string;
  role: 'VIEWER' | 'EDITOR';
  createdAt: Date;
  updatedAt: Date;
  user: { email: string; name: string };
}

function toRecord(row: PermissionRow): PagePermissionRecord {
  const { user, ...permission } = row;

  return { ...permission, email: user.email, name: user.name };
}

/** Доступ к модели разрешений: запросы модели и истолкование их строк. */
@Injectable()
export abstract class PagePermissionsRepository {
  /** Копия на соединении транзакции — по той же причине, что и у прочих репозиториев. */
  abstract bind(scope: TransactionScope): PagePermissionsRepository;

  /** Эффективная роль либо `null`, когда доступа нет. */
  abstract resolveRole(userId: string, pageId: string): Promise<PageRole | null>;

  /** Плоский список доступных чужих страниц с ролью на каждой. */
  abstract findAccessiblePages(userId: string): Promise<AccessiblePageRow[]>;

  /** Создаёт разрешение либо меняет роль существующего: пара уникальна по PK. */
  abstract upsert(input: UpsertPermissionInput): Promise<PagePermissionRecord>;

  /** `false`, когда разрешения не было: отзывать нечего. */
  abstract remove(pageId: string, userId: string): Promise<boolean>;

  /** Прямые разрешения одной страницы. Унаследованных здесь нет и быть не может. */
  abstract findByPage(pageId: string): Promise<PagePermissionRecord[]>;

  /**
   * Владелец живой страницы, `null` — если её нет. Читается здесь, а не через
   * `PagesRepository`: иначе модуль разрешений зависел бы от модуля страниц, который
   * сам зависит от него.
   */
  abstract findPageOwner(pageId: string): Promise<string | null>;
}

@Injectable()
export class PrismaPagePermissionsRepository extends PagePermissionsRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaPagePermissionsRepository {
    return new PrismaPagePermissionsRepository(databaseClientOf(scope));
  }

  async resolveRole(userId: string, pageId: string): Promise<PageRole | null> {
    return this.decideRole(await this.readAccessChain(userId, pageId), userId);
  }

  async findAccessiblePages(userId: string): Promise<AccessiblePageRow[]> {
    const rows = await this.readAccessiblePages(userId);

    return rows.map((row) => ({
      ...row,
      role: row.role === 'EDITOR' ? PageRole.EDITOR : PageRole.VIEWER,
    }));
  }

  /**
   * Роль решается по цепочке, а не по одной строке: владелец сильнее всего, иначе
   * побеждает ближайшее прямое разрешение — отсюда `ORDER BY depth` в запросе.
   * Пустая цепочка означает «нет страницы, она удалена либо удалён её проект».
   */
  private decideRole(chain: readonly PageAccessChainRow[], userId: string): PageRole | null {
    const page = chain[0];

    if (page === undefined) {
      return null;
    }

    if (page.ownerId === userId) {
      return PageRole.OWNER;
    }

    for (const link of chain) {
      if (link.role !== null) {
        return link.role === 'EDITOR' ? PageRole.EDITOR : PageRole.VIEWER;
      }
    }

    return null;
  }

  /**
   * Цепочка от страницы вверх до границы наследования. Подъём останавливает
   * `accessMode = RESTRICTED` в рекурсивной части: сама такая страница в выборку уже
   * попала, поэтому выданное на ней разрешение действует, а выше не идём.
   *
   * Проверка проекта нужна один раз, на depth 0: вся цепочка лежит в одном проекте —
   * это держит composite FK.
   */
  private readAccessChain(userId: string, pageId: string): Promise<PageAccessChainRow[]> {
    return this.client.$queryRaw<PageAccessChainRow[]>`
      WITH RECURSIVE chain AS (
        SELECT page."id", page."parentPageId", page."ownerId", page."accessMode", 0 AS depth
        FROM "Page" page
        JOIN "Project" project
          ON project."id" = page."projectId" AND project."deletedAt" IS NULL
        WHERE page."id" = ${pageId}::uuid AND page."deletedAt" IS NULL
        UNION ALL
        SELECT parent."id", parent."parentPageId", parent."ownerId", parent."accessMode",
               chain.depth + 1
        FROM "Page" parent
        JOIN chain ON chain."parentPageId" = parent."id"
        WHERE chain."accessMode" = 'INHERIT'::"PageAccessMode"
          AND parent."deletedAt" IS NULL
      )
      SELECT chain."ownerId", chain.depth::int AS depth, permission."role"
      FROM chain
      LEFT JOIN "PagePermission" permission
        ON permission."pageId" = chain."id" AND permission."userId" = ${userId}::uuid
      ORDER BY chain.depth ASC
    `;
  }

  /**
   * Затравка — страницы с прямым разрешением. Спуск идёт только в детей без
   * собственного разрешения и с режимом `inherit`: `NOT EXISTS` по `granted` не даёт
   * странице прийти дважды — затравкой со своей ролью и потомком с унаследованной.
   *
   * Условие `ownerId <> $1` — страховка: выдача разрешения самому себе отклоняется на
   * входе, но полагаться на прикладную проверку в запросе про «чужие страницы» не стоит.
   */
  private readAccessiblePages(userId: string): Promise<AccessiblePageRawRow[]> {
    return this.client.$queryRaw<AccessiblePageRawRow[]>`
      WITH RECURSIVE granted AS (
        SELECT page."id", permission."role"
        FROM "PagePermission" permission
        JOIN "Page" page
          ON page."id" = permission."pageId" AND page."deletedAt" IS NULL
        JOIN "Project" project
          ON project."id" = page."projectId" AND project."deletedAt" IS NULL
        WHERE permission."userId" = ${userId}::uuid AND page."ownerId" <> ${userId}::uuid
      ),
      accessible AS (
        SELECT seed."id", seed."role" FROM granted seed
        UNION ALL
        SELECT child."id", parent."role"
        FROM "Page" child
        JOIN accessible parent ON child."parentPageId" = parent."id"
        WHERE child."deletedAt" IS NULL
          AND child."accessMode" = 'INHERIT'::"PageAccessMode"
          AND NOT EXISTS (SELECT 1 FROM granted own WHERE own."id" = child."id")
      )
      SELECT page."id", page."ownerId", page."projectId", page."parentPageId",
             page."createdById", page."title", page."position", page."accessMode",
             page."createdAt", page."updatedAt", accessible."role"
      FROM accessible
      JOIN "Page" page ON page."id" = accessible."id"
    `;
  }

  async upsert(input: UpsertPermissionInput): Promise<PagePermissionRecord> {
    const row = await this.client.pagePermission.upsert({
      create: {
        grantedById: input.grantedById,
        pageId: input.pageId,
        role: input.role,
        userId: input.userId,
      },
      select: PERMISSION_FIELDS,
      // Выдавший не переписывается: строка помнит, кто открыл доступ первым.
      update: { role: input.role },
      where: { pageId_userId: { pageId: input.pageId, userId: input.userId } },
    });

    return toRecord(row);
  }

  async remove(pageId: string, userId: string): Promise<boolean> {
    const { count } = await this.client.pagePermission.deleteMany({ where: { pageId, userId } });

    return count > 0;
  }

  async findByPage(pageId: string): Promise<PagePermissionRecord[]> {
    const rows = await this.client.pagePermission.findMany({
      // Порядок детерминирован: email уникален, поэтому тай-брейк не нужен.
      orderBy: { user: { email: 'asc' } },
      select: PERMISSION_FIELDS,
      where: { pageId },
    });

    return rows.map(toRecord);
  }

  async findPageOwner(pageId: string): Promise<string | null> {
    const page = await this.client.page.findFirst({
      select: { ownerId: true },
      where: { deletedAt: null, id: pageId },
    });

    return page?.ownerId ?? null;
  }
}
