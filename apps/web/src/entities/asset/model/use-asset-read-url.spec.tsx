import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api';
import { useAssetReadUrl } from './use-asset-read-url';

describe('useAssetReadUrl', () => {
  afterEach(() => vi.restoreAllMocks());

  it('caches by asset, page authorization context and current user; refreshes a broken image once', async () => {
    const read = vi.spyOn(api, 'createAssetReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/signed-1.jpg',
      expiresInSeconds: 300,
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useAssetReadUrl('asset-1', 'user-1', { id: 'page-1', kind: 'page' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/signed-1.jpg'));
    expect(api.getAssetReadUrlQueryKey('asset-1', 'page:page-1', 'user-1')).toEqual([
      'asset-read-url',
      'asset-1',
      'page:page-1',
      'user-1',
    ]);
    expect(api.getAssetReadUrlQueryKey('asset-1', 'page:page-1', 'user-2')).not.toEqual(
      api.getAssetReadUrlQueryKey('asset-1', 'page:page-1', 'user-1'),
    );

    act(() => {
      result.current.onImageError();
      result.current.onImageError();
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenCalledWith('asset-1', { pageId: 'page-1' });
    queryClient.clear();
  });

  it('fails closed and does not retry a permission denial', async () => {
    const denied = Object.assign(new Error('forbidden'), { status: 403 });
    const read = vi.spyOn(api, 'createAvatarReadUrl').mockRejectedValue(denied);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useAssetReadUrl('asset-2', 'viewer-1', { id: 'owner-1', kind: 'avatar' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.src).toBeUndefined();
    queryClient.clear();
  });

  it('retries a temporary server error once and resolves the asset', async () => {
    const read = vi
      .spyOn(api, 'createAssetReadUrl')
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }))
      .mockResolvedValue({ url: 'https://cdn.example.com/recovered.jpg', expiresInSeconds: 300 });
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useAssetReadUrl('asset-3', 'user-1', { id: 'page-1', kind: 'page' }),
      { reactStrictMode: false, wrapper },
    );

    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/recovered.jpg'), {
      timeout: 5_000,
    });
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(read.mock.calls.length).toBeLessThanOrEqual(3);
    const completedCalls = read.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(read).toHaveBeenCalledTimes(completedCalls);
    queryClient.clear();
  });
});
