import type { PresenceUser } from './page-document-session';

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

type AwarenessLike = {
  getStates(): ReadonlyMap<number, unknown>;
};

export function getPresenceColor(userId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return PRESENCE_COLORS[(hash >>> 0) % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0];
}

export function getPresenceUsers(awareness: AwarenessLike): readonly PresenceUser[] {
  const representatives = new Map<string, { clientId: number; user: PresenceUser }>();

  awareness.getStates().forEach((state, clientId) => {
    const user = parsePresenceUser(state);
    if (!user) return;

    const current = representatives.get(user.id);
    if (!current || clientId < current.clientId) {
      representatives.set(user.id, { clientId, user });
    }
  });

  return [...representatives.values()]
    .sort((left, right) => left.user.id.localeCompare(right.user.id))
    .map(({ user }) => user);
}

function parsePresenceUser(state: unknown): PresenceUser | undefined {
  if (!isRecord(state) || !isRecord(state.user)) return undefined;
  const { id, name, color } = state.user;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof color !== 'string' ||
    color.length === 0
  ) {
    return undefined;
  }

  return { id, name, color };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
