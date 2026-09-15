export const PRESENCE_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
] as const;

const PRESENCE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function getPresenceColor(userId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return PRESENCE_COLORS[(hash >>> 0) % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0];
}

export function isSupportedPresenceColor(value: unknown): value is string {
  return typeof value === 'string' && PRESENCE_COLOR_PATTERN.test(value);
}

export function resolvePresenceColor(userId: unknown, color: unknown): string {
  return isSupportedPresenceColor(color)
    ? color
    : getPresenceColor(typeof userId === 'string' ? userId : 'unknown');
}
