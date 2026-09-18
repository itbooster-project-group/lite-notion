/**
 * Роли эффективного доступа. `viewer` и `editor` приходят из `PagePermission.role`,
 * `owner` в таблице не хранится: владение живёт в `Page.ownerId`.
 */
export const PageRole = {
  EDITOR: 'editor',
  OWNER: 'owner',
  VIEWER: 'viewer',
} as const;

export type PageRole = (typeof PageRole)[keyof typeof PageRole];

/**
 * Порядок ролей. Индекс — сила: `editor` включает в себя всё, что даёт `viewer`,
 * а `owner` — всё остальное.
 */
export const ROLE_ORDER: readonly PageRole[] = [PageRole.VIEWER, PageRole.EDITOR, PageRole.OWNER];

/**
 * Роли, которые можно выдать. `owner` сюда не входит: владение живёт в
 * `Page.ownerId`, и передавать его через маршруты разрешений нельзя.
 */
export const GRANTABLE_ROLES = [PageRole.VIEWER, PageRole.EDITOR] as const;

export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

/** Режимы наследования в контракте — строчные, enum базы наружу не течёт. */
export const ACCESS_MODES = ['inherit', 'restricted'] as const;

export type AccessModeValue = (typeof ACCESS_MODES)[number];
