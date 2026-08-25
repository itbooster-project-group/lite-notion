import { describe, expect, it } from 'vitest';

import { getLoginPath, getSafeReturnPath } from './return-path';

describe('auth return path', () => {
  it.each(['/', '/profile'])('разрешает локальный маршрут %s', (path) => {
    expect(getSafeReturnPath(path)).toBe(path);
  });

  it.each([null, undefined, '', '//evil.example', 'https://evil.example', '/unknown'])(
    'заменяет небезопасный адрес %s на главную',
    (path) => {
      expect(getSafeReturnPath(path)).toBe('/');
    },
  );

  it('создаёт login URL только с разрешённым next', () => {
    expect(getLoginPath('/profile')).toBe('/login?next=%2Fprofile');
    expect(getLoginPath('/unknown')).toBe('/login?next=%2F');
  });
});
