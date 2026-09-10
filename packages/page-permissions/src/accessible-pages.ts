import type { PrismaClient } from '@lite-notion/database';

import { PageRole } from './roles';

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

type QueryableClient = Pick<PrismaClient, '$queryRaw'>;

interface RawRow extends Omit<AccessiblePageRow, 'role'> {
  role: 'VIEWER' | 'EDITOR';
}

/**
 * Все страницы чужих деревьев, доступные пользователю, плоским списком. Вложенность
 * и порядок собирает вызывающий: это нужно только API, и дереву тут не место.
 *
 * Затравка — страницы с прямым разрешением. Спуск идёт только в детей без
 * собственного разрешения и с режимом `inherit`: `NOT EXISTS` по `granted` не даёт
 * странице прийти дважды — один раз затравкой со своей ролью, второй раз потомком с
 * унаследованной. Ребёнок с собственным разрешением уже лежит в затравке, поэтому
 * `restricted` на нём выдачу не теряет.
 *
 * Условие `ownerId <> $1` — страховка: выдача разрешения самому себе отклоняется на
 * входе, но полагаться на прикладную проверку в запросе про «чужие страницы» не стоит.
 */
export async function findAccessiblePages(
  client: QueryableClient,
  userId: string,
): Promise<AccessiblePageRow[]> {
  const rows = await client.$queryRaw<RawRow[]>`
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

  return rows.map((row) => ({
    ...row,
    role: row.role === 'EDITOR' ? PageRole.EDITOR : PageRole.VIEWER,
  }));
}
