import { HttpResponse, http } from 'msw';

import { getAuthMock, getHealthMock } from '../generated/index.msw';

const defaultGuestSession = http.post('*/api/v1/auth/refresh', () =>
  HttpResponse.json(
    {
      error: 'Unauthorized',
      message: 'Invalid refresh token',
      path: '/api/v1/auth/refresh',
      statusCode: 401,
      timestamp: '2026-08-25T00:00:00.000Z',
    },
    { status: 401 },
  ),
);

export const handlers = [defaultGuestSession, ...getHealthMock(), ...getAuthMock()];
