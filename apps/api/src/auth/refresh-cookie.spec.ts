import { describe, expect, it } from 'vitest';

import { NodeEnvironment } from '../config/environment';
import {
  createClearRefreshCookieOptions,
  createRefreshCookieOptions,
  REFRESH_COOKIE_PATH,
} from './refresh-cookie';

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
