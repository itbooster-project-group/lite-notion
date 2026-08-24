import { describe, expect, it } from 'vitest';

import { NodeEnvironment } from '../config/environment';
import { REFRESH_COOKIE_PATH } from './constants';
import {
  createClearRefreshCookieOptions,
  createRefreshCookieOptions,
  exceedsPasswordByteLimit,
  passwordByteLength,
} from './helpers';

describe('createRefreshCookieOptions', () => {
  it('в development использует SameSite=Lax без Secure', () => {
    expect(createRefreshCookieOptions(NodeEnvironment.Development, 2592000)).toEqual({
      httpOnly: true,
      maxAge: 2592000000,
      path: REFRESH_COOKIE_PATH,
      sameSite: 'lax',
      secure: false,
    });
  });

  it.each([NodeEnvironment.Production, NodeEnvironment.Test])(
    'в %s использует SameSite=None вместе с Secure',
    (nodeEnvironment) => {
      expect(createRefreshCookieOptions(nodeEnvironment, 604800)).toMatchObject({
        sameSite: 'none',
        secure: true,
      });
    },
  );

  it('всегда ставит HttpOnly и ограничивает cookie путём эндпоинтов аутентификации', () => {
    expect(createRefreshCookieOptions(NodeEnvironment.Production, 604800)).toMatchObject({
      httpOnly: true,
      path: '/api/v1/auth',
    });
  });

  it('переводит срок жизни из секунд в миллисекунды', () => {
    expect(createRefreshCookieOptions(NodeEnvironment.Development, 3601).maxAge).toBe(3601000);
  });
});

describe('createClearRefreshCookieOptions', () => {
  it('повторяет флаги установки, но не задаёт maxAge', () => {
    const clearOptions = createClearRefreshCookieOptions(NodeEnvironment.Development);

    expect(clearOptions).toEqual({
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      sameSite: 'lax',
      secure: false,
    });
    expect(clearOptions).not.toHaveProperty('maxAge');
  });

  it('совпадает по флагам с установкой cookie вне development', () => {
    const { maxAge: _maxAge, ...setOptions } = createRefreshCookieOptions(
      NodeEnvironment.Production,
      604800,
    );

    expect(createClearRefreshCookieOptions(NodeEnvironment.Production)).toEqual(setOptions);
  });
});

describe('passwordByteLength / exceedsPasswordByteLimit', () => {
  it('считает длину в байтах UTF-8, а не в символах', () => {
    expect(passwordByteLength('a'.repeat(40))).toBe(40);
    expect(passwordByteLength('п'.repeat(40))).toBe(80);
    expect('п'.repeat(40)).toHaveLength(40);
  });

  it.each([
    ['72 ASCII-символа', 'a'.repeat(72), 72],
    ['36 символов кириллицы', 'п'.repeat(36), 72],
    ['18 emoji', '😀'.repeat(18), 72],
  ])('укладывает %s в лимит', (_case, password, expectedBytes) => {
    expect(passwordByteLength(password)).toBe(expectedBytes);
    expect(exceedsPasswordByteLimit(password)).toBe(false);
  });

  it.each([
    ['73 ASCII-символа', 'a'.repeat(73), 73],
    ['40 символов кириллицы, проходящих проверку по символам', 'п'.repeat(40), 80],
    ['36 emoji, проходящих проверку по символам', '😀'.repeat(36), 144],
  ])('выводит %s за лимит', (_case, password, expectedBytes) => {
    expect(passwordByteLength(password)).toBe(expectedBytes);
    expect(exceedsPasswordByteLimit(password)).toBe(true);
  });
});
