import { PageRole } from '@lite-notion/page-permissions';

/**
 * Роли, которые можно выдать. `owner` сюда не входит: владение живёт в
 * `Page.ownerId`, и передавать его через маршруты разрешений нельзя.
 */
export const GRANTABLE_ROLES = [PageRole.VIEWER, PageRole.EDITOR] as const;

export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

/** Режимы наследования в контракте — строчные, enum базы наружу не течёт. */
export const ACCESS_MODES = ['inherit', 'restricted'] as const;

export type AccessModeValue = (typeof ACCESS_MODES)[number];
