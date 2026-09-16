import { NodeEnvironment } from '../config/environment';
import { Prisma } from '../generated/prisma/client';
import { PASSWORD_MAX_BYTES, REFRESH_COOKIE_PATH } from './constants';

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, 'utf8');
}

export function exceedsPasswordByteLimit(password: string): boolean {
  return passwordByteLength(password) > PASSWORD_MAX_BYTES;
}

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

/**
 * P2002 прилетает и на `Session.tokenHash`, поэтому проверяется именно колонка email.
 * `meta.target` бывает массивом колонок и строкой с именем индекса — разбирается и то,
 * и другое.
 */
export function isUniqueEmailViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes('email');
  }

  return typeof target === 'string' && target.includes('email');
}
