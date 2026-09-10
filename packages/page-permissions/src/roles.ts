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
const ORDER: readonly PageRole[] = [PageRole.VIEWER, PageRole.EDITOR, PageRole.OWNER];

/**
 * Хватает ли роли. Отдельная функция, а не сравнение строк по месту: иначе правило
 * расползётся по вызывающим условиями вида `role === 'editor' || role === 'owner'`.
 */
export function roleAtLeast(actual: PageRole, required: PageRole): boolean {
  return ORDER.indexOf(actual) >= ORDER.indexOf(required);
}
