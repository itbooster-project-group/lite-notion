import {
  getPresenceColor,
  isSupportedPresenceColor,
  PRESENCE_COLORS,
  resolvePresenceColor,
} from '@/shared/lib/presence-color';
import type { PresenceUser } from './page-document-session';

export { getPresenceColor, isSupportedPresenceColor, PRESENCE_COLORS, resolvePresenceColor };

type AwarenessLike = {
  getStates(): ReadonlyMap<number, unknown>;
};

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
    !isSupportedPresenceColor(color)
  ) {
    return undefined;
  }

  return { id, name, color };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
