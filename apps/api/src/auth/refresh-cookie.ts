import { API_GLOBAL_PREFIX } from '../application';
import { NodeEnvironment } from '../config/environment';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Cookie ограничена путём эндпоинтов аутентификации: на остальные маршруты
 * refresh-токен не отправляется, потому что они авторизуются bearer-токеном.
 */
export const REFRESH_COOKIE_PATH = `/${API_GLOBAL_PREFIX}/auth`;

export interface RefreshCookieOptions {
  httpOnly: true;
  path: string;
  sameSite: 'lax' | 'none';
  secure: boolean;
  maxAge?: number;
}

/**
 * Вне development предполагаются разные домены web и API, поэтому нужен
 * `SameSite=None`, а его браузеры принимают только вместе с `Secure`.
 * В development остаётся `Lax`: он же закрывает CSRF на `POST /auth/refresh`.
 */
function resolveCrossSiteFlags(
  nodeEnvironment: NodeEnvironment,
): Pick<RefreshCookieOptions, 'sameSite' | 'secure'> {
  return nodeEnvironment === NodeEnvironment.Development
    ? { sameSite: 'lax', secure: false }
    : { sameSite: 'none', secure: true };
}

export function createRefreshCookieOptions(
  nodeEnvironment: NodeEnvironment,
  refreshTokenTtlS: number,
): RefreshCookieOptions {
  return {
    httpOnly: true,
    maxAge: refreshTokenTtlS * 1000,
    path: REFRESH_COOKIE_PATH,
    ...resolveCrossSiteFlags(nodeEnvironment),
  };
}

export function createClearRefreshCookieOptions(
  nodeEnvironment: NodeEnvironment,
): Omit<RefreshCookieOptions, 'maxAge'> {
  return {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    ...resolveCrossSiteFlags(nodeEnvironment),
  };
}
