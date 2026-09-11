import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AccessTokenVerificationError, verifyAccessToken } from './index';

const secret = 'local-development-only-change-me-before-deploy';

describe('verifyAccessToken', () => {
  it('проверяет подпись и возвращает пользователя с сессией', () => {
    const token = jwt.sign({ sid: 'session-id', sub: 'user-id' }, secret, { expiresIn: 60 });

    expect(verifyAccessToken(token, secret)).toEqual({
      sessionId: 'session-id',
      userId: 'user-id',
    });
  });

  it('отклоняет malformed token', () => {
    expect(() => verifyAccessToken('not-a-jwt', secret)).toThrow(AccessTokenVerificationError);
  });

  it('отклоняет expired token', () => {
    const token = jwt.sign({ sid: 'session-id', sub: 'user-id' }, secret, { expiresIn: -1 });

    expect(() => verifyAccessToken(token, secret)).toThrow(AccessTokenVerificationError);
  });

  it('отклоняет incorrectly signed token', () => {
    const token = jwt.sign({ sid: 'session-id', sub: 'user-id' }, 'another-secret', {
      expiresIn: 60,
    });

    expect(() => verifyAccessToken(token, secret)).toThrow(AccessTokenVerificationError);
  });

  it('отклоняет payload без sub или sid', () => {
    const token = jwt.sign({ sub: 'user-id' }, secret, { expiresIn: 60 });

    expect(() => verifyAccessToken(token, secret)).toThrow(AccessTokenVerificationError);
  });
});
