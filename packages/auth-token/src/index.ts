import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sid: string;
  sub: string;
}

export interface VerifiedAccessToken {
  sessionId: string;
  userId: string;
}

export class AccessTokenVerificationError extends Error {
  constructor() {
    super('Access token verification failed');
  }
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<AccessTokenPayload>;

  return typeof payload.sub === 'string' && typeof payload.sid === 'string';
}

export function verifyAccessToken(token: string, secret: string): VerifiedAccessToken {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });

    if (!isAccessTokenPayload(payload)) {
      throw new AccessTokenVerificationError();
    }

    return {
      sessionId: payload.sid,
      userId: payload.sub,
    };
  } catch {
    throw new AccessTokenVerificationError();
  }
}
