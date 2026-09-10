import type { PrismaClient } from '@lite-notion/database';

import { PageRole } from './roles';

/**
 * Звено цепочки от страницы вверх. `depth` 0 — сама страница; `role` не пуст, только
 * когда на этом звене есть прямое разрешение спрашивающего.
 */
export interface PageAccessChainRow {
  ownerId: string;
  depth: number;
  role: 'VIEWER' | 'EDITOR' | null;
}

/** Клиент нужен только для сырого запроса: пакет своего соединения не заводит. */
type QueryableClient = Pick<PrismaClient, '$queryRaw'>;

/**
 * Цепочка от страницы вверх до границы наследования. Подъём останавливает
 * `accessMode = RESTRICTED` в рекурсивной части: сама такая страница в выборку уже
 * попала, поэтому выданное на ней прямое разрешение действует, а выше не идём.
 *
 * Проверка проекта нужна один раз, на depth 0: вся цепочка лежит в одном проекте —
 * это держит composite FK.
 */
function readChain(
  client: QueryableClient,
  userId: string,
  pageId: string,
): Promise<PageAccessChainRow[]> {
  return client.$queryRaw<PageAccessChainRow[]>`
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
 * Роль решается по цепочке, а не по одной строке: владелец сильнее всего, иначе
 * побеждает ближайшее прямое разрешение — отсюда `ORDER BY depth` в запросе.
 * Пустая цепочка означает «нет страницы, она удалена либо удалён её проект» —
 * три случая, которые контракт и так делает неразличимыми.
 */
function decideRole(chain: readonly PageAccessChainRow[], userId: string): PageRole | null {
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
 * Эффективная роль пользователя на странице либо `null`, когда доступа нет.
 * Единственная реализация модели: её же зовут REST API и collaboration runtime.
 */
export async function resolveEffectiveRole(
  client: QueryableClient,
  userId: string,
  pageId: string,
): Promise<PageRole | null> {
  return decideRole(await readChain(client, userId, pageId), userId);
}
