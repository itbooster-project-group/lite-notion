import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/shared/api/mocks/server';

import { SessionProvider, useSession } from './session-provider';

afterEach(cleanup);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}

describe('SessionProvider', () => {
  it('восстанавливает токен и current-user query', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    expect(result.current.user).toEqual(
      expect.objectContaining({ email: expect.any(String), name: expect.any(String) }),
    );
  });

  it('трактует refresh 401 как unauthenticated', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'Invalid refresh token' }, { status: 401 }),
      ),
    );

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeUndefined();
  });

  it('показывает recoverable error и позволяет повторить bootstrap', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'Service unavailable' }, { status: 503 }),
      ),
    );

    const { result } = renderHook(() => useSession(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.status).toBe('error'));

    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );

    await act(() => result.current.restoreSession());

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });
});
