import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './helpers';

describe('normalizeEmail', () => {
  it.each([
    ['User@Example.COM', 'user@example.com'],
    ['  user@example.com  ', 'user@example.com'],
    ['USER@EXAMPLE.COM', 'user@example.com'],
  ])('приводит %s к %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});
