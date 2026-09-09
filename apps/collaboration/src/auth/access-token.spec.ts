import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import {
  authenticateAccessToken,
  CollaborationAuthenticationError,
  extractAccessToken,
} from './access-token';

const secret = 'local-development-only-change-me-before-deploy';

describe('collaboration access token authentication', () => {
  it('использует Hocuspocus token', () => {
    const token = jwt.sign({ sid: 'session-id', sub: 'user-id' }, secret, { expiresIn: 60 });

    expect(authenticateAccessToken(token, new Headers(), secret)).toEqual({
      sessionId: 'session-id',
      userId: 'user-id',
    });
  });

  it('поддерживает Authorization Bearer fallback', () => {
    expect(extractAccessToken('', new Headers({ authorization: 'Bearer access-token' }))).toBe(
      'access-token',
    );
  });

  it('отклоняет connection без token', () => {
    expect(() => extractAccessToken('', new Headers())).toThrow(CollaborationAuthenticationError);
  });

  it('отклоняет invalid token', () => {
    expect(() => authenticateAccessToken('not-a-jwt', new Headers(), secret)).toThrow(
      CollaborationAuthenticationError,
    );
  });
});
