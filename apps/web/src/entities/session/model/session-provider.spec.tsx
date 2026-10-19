import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { assetReadUrlQueryKey, clearAccessToken } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { SessionProvider, useSession } from './session-provider';

afterEach(() => {
  cleanup();
  clearAccessToken();
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = function SessionWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
  return { queryClient, Wrapper };
}

describe('SessionProvider', () => {
  it('восстанавливает токен и current-user query', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

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

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeUndefined();
  });

  it('показывает recoverable error и позволяет повторить bootstrap', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'Service unavailable' }, { status: 503 }),
      ),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));

    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );

    await act(() => result.current.restoreSession());

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
  });

  it('не восстанавливает UI state после очистки во время refresh', async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    server.use(
      http.post(
        '*/api/v1/auth/refresh',
        () =>
          new Promise<Response>((resolve) => {
            resolveRefresh = resolve;
          }),
      ),
    );
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });
    await waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));

    act(() => result.current.clearSession());
    resolveRefresh?.(HttpResponse.json({ accessToken: 'stale-token', expiresIn: 900 }));

    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeUndefined();
  });

  it('clears authorization-sensitive asset URLs when the session ends', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    queryClient.setQueryData([...assetReadUrlQueryKey, 'asset-1', 'page:page-1', 'user-1'], {
      url: 'https://signed.example.com/private',
    });

    act(() => result.current.clearSession());

    expect(queryClient.getQueriesData({ queryKey: assetReadUrlQueryKey })).toEqual([]);
    queryClient.clear();
  });

  it('clears authorization-sensitive asset URLs when the authenticated user changes', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
      ),
    );
    const { queryClient, Wrapper } = createWrapper();
    const { result } = renderHook(() => useSession(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.user).toBeDefined());
    const oldUser = result.current.user;
    if (!oldUser) throw new Error('Expected a restored user');
    queryClient.setQueryData([...assetReadUrlQueryKey, 'asset-1', 'page:page-1', oldUser.id], {
      url: 'https://signed.example.com/private',
    });

    act(() =>
      result.current.authenticate({
        accessToken: 'next-token',
        expiresIn: 900,
        user: { ...oldUser, id: 'different-user' },
      }),
    );

    expect(queryClient.getQueriesData({ queryKey: assetReadUrlQueryKey })).toEqual([]);
    queryClient.clear();
  });
});
