import {
  type AccessiblePageRow,
  findAccessiblePages,
  type PageRole,
  resolveEffectiveRole,
} from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';

export type { AccessiblePageRow };

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

/**
 * Доступ к модели разрешений. Правил здесь нет: они в `@lite-notion/page-permissions`,
 * и той же реализацией пользуется collaboration runtime. Репозиторий существует
 * только затем, чтобы дать Nest DI-токен и клиент транзакции.
 */
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

  resolveRole(userId: string, pageId: string): Promise<PageRole | null> {
    return resolveEffectiveRole(this.client, userId, pageId);
  }

  findAccessiblePages(userId: string): Promise<AccessiblePageRow[]> {
    return findAccessiblePages(this.client, userId);
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
