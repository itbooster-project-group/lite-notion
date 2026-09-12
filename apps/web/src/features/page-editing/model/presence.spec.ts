import { describe, expect, it } from 'vitest';
import { getPresenceColor, getPresenceUsers, PRESENCE_COLORS } from './presence';

describe('presence model', () => {
  it('maps a user id to a stable palette color', () => {
    expect(getPresenceColor('user-a')).toBe(getPresenceColor('user-a'));
    expect(PRESENCE_COLORS).toContain(getPresenceColor('user-a'));
  });

  it('deduplicates states by user id using the smallest numeric client id', () => {
    const states = new Map<number, Record<string, unknown>>();
    states.set(20, { user: { id: 'user-a', name: 'Ada', color: '#111111' } });
    states.set(5, { user: { id: 'user-a', name: 'Ada', color: '#222222' } });
    states.set(8, { user: { id: 'user-b', name: 'Bob', color: '#333333' } });

    expect(getPresenceUsers({ getStates: () => states })).toEqual([
      { id: 'user-a', name: 'Ada', color: '#222222' },
      { id: 'user-b', name: 'Bob', color: '#333333' },
    ]);
  });

  it('ignores empty and malformed states and keeps stable user order', () => {
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { id: '', name: 'Empty', color: '#111111' } }],
      [2, { user: { id: 'user-z', name: '', color: '#222222' } }],
      [3, { user: { id: 'user-b', name: 'Bob', color: '#333333' } }],
      [4, {}],
      [5, { user: 'invalid' }],
      [6, { user: { id: 'user-a', name: 'Ada', color: '#444444' } }],
    ]);

    expect(getPresenceUsers({ getStates: () => states })).toEqual([
      { id: 'user-a', name: 'Ada', color: '#444444' },
      { id: 'user-b', name: 'Bob', color: '#333333' },
    ]);
  });
});
