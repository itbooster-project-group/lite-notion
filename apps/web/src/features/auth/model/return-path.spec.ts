import { describe, expect, it } from 'vitest';

import { getAuthFormPath, getSafeReturnPath } from './return-path';

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

  it('переносит между auth-формами только разрешённый next', () => {
    expect(getAuthFormPath('/register', '/profile')).toBe('/register?next=%2Fprofile');
    expect(getAuthFormPath('/login', '/')).toBe('/login?next=%2F');
    expect(getAuthFormPath('/register', 'https://evil.example')).toBe('/register');
  });
});
