import { verifyAccessToken } from '@lite-notion/auth-token';

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('Collaboration authentication failed');
  }
}

export function extractAccessToken(token: string, headers: Headers): string {
  if (token !== '') {
    return token;
  }

  const authorization = headers.get('authorization');
  const [scheme, credentials] = authorization?.split(' ') ?? [];

  if (scheme?.toLowerCase() === 'bearer' && credentials) {
    return credentials;
  }

  throw new CollaborationAuthenticationError();
}

export function authenticateAccessToken(
  token: string,
  headers: Headers,
  jwtSecret: string,
): { sessionId: string; userId: string } {
  try {
    return verifyAccessToken(extractAccessToken(token, headers), jwtSecret);
  } catch {
    throw new CollaborationAuthenticationError();
  }
}
