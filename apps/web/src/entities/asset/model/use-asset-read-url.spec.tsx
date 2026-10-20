import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api';
import { useAssetReadUrl } from './use-asset-read-url';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false },
    },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

function mockReadUrls(assetId: string, urls: string[]) {
  let nextUrl = 0;
  return vi.spyOn(api, 'createAssetReadUrl').mockImplementation(async (requestedAssetId) => ({
    url:
      requestedAssetId === assetId
        ? (urls[Math.min(nextUrl++, urls.length - 1)] ?? '')
        : 'https://cdn.example.com/unrelated.jpg',
    expiresInSeconds: 300,
  }));
}

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

    const callsBeforeImageError = read.mock.calls.length;
    act(() => {
      result.current.onImageError();
      result.current.onImageError();
    });
    await waitFor(() => expect(read.mock.calls.length).toBe(callsBeforeImageError + 1));
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

  it('refreshes once when the image first fails, even if the signed URL changes', async () => {
    let imageFailed = false;
    const read = vi.spyOn(api, 'createAssetReadUrl').mockImplementation(async () => ({
      url: imageFailed ? 'https://cdn.example.com/new.jpg' : 'https://cdn.example.com/old.jpg',
      expiresInSeconds: 300,
    }));
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAssetReadUrl('asset-cycle', 'user-1', { id: 'page-1', kind: 'page' }),
      { reactStrictMode: true, wrapper },
    );
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/old.jpg'));

    const callsBeforeImageError = read.mock.calls.length;
    imageFailed = true;
    act(() => result.current.onImageError());
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/new.jpg'));
    act(() => result.current.onImageError());

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    expect(read).toHaveBeenCalledTimes(callsBeforeImageError + 1);
    queryClient.clear();
  });

  it('hides a failed image while the bounded signed URL refresh is pending', async () => {
    let resolveRefresh: ((value: { url: string; expiresInSeconds: number }) => void) | undefined;
    let readCount = 0;
    const refreshPromise = new Promise<{ url: string; expiresInSeconds: number }>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(api, 'createAssetReadUrl').mockImplementation(async () => {
      readCount += 1;
      return readCount === 1
        ? { url: 'https://cdn.example.com/old.jpg', expiresInSeconds: 300 }
        : refreshPromise;
    });
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAssetReadUrl('asset-pending-refresh', 'user-1', { id: 'page-1', kind: 'page' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/old.jpg'));

    act(() => result.current.onImageError());

    expect(result.current.state).toBe('unavailable');
    await act(async () => {
      resolveRefresh?.({ url: 'https://cdn.example.com/new.jpg', expiresInSeconds: 300 });
    });
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/new.jpg'));
    expect(result.current.state).toBe('ready');
    queryClient.clear();
  });

  it('shows unavailable when the refreshed URL also fails to load', async () => {
    mockReadUrls('asset-fallback', [
      'https://cdn.example.com/old.jpg',
      'https://cdn.example.com/new.jpg',
    ]);
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAssetReadUrl('asset-fallback', 'user-1', { id: 'page-1', kind: 'page' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/old.jpg'));

    act(() => result.current.onImageError());
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/new.jpg'));
    act(() => result.current.onImageError());

    await waitFor(() => expect(result.current.state).toBe('unavailable'));
    queryClient.clear();
  });

  it('starts a new refresh cycle when the asset identity changes', async () => {
    const read = vi.spyOn(api, 'createAssetReadUrl').mockImplementation(async (assetId) => ({
      url: `https://cdn.example.com/${assetId}.jpg`,
      expiresInSeconds: 300,
    }));
    const { queryClient, wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ assetId }: { assetId: string }) =>
        useAssetReadUrl(assetId, 'user-1', { id: 'page-1', kind: 'page' }),
      { initialProps: { assetId: 'asset-a' }, wrapper },
    );
    await waitFor(() => expect(result.current.src).toContain('asset-a'));
    act(() => result.current.onImageError());
    await waitFor(() =>
      expect(
        read.mock.calls.filter(([requestedAssetId]) => requestedAssetId === 'asset-a'),
      ).toHaveLength(2),
    );

    rerender({ assetId: 'asset-b' });
    await waitFor(() => expect(result.current.src).toContain('asset-b'));
    act(() => result.current.onImageError());
    await waitFor(() =>
      expect(
        read.mock.calls.filter(([requestedAssetId]) => requestedAssetId === 'asset-b'),
      ).toHaveLength(2),
    );
    queryClient.clear();
  });

  it('resets the recovery limit after a successful image load', async () => {
    const read = mockReadUrls('asset-reset', [
      'https://cdn.example.com/old.jpg',
      'https://cdn.example.com/new.jpg',
      'https://cdn.example.com/loaded-again.jpg',
    ]);
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => useAssetReadUrl('asset-reset', 'user-1', { id: 'page-1', kind: 'page' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/old.jpg'));
    act(() => result.current.onImageError());
    await waitFor(() => expect(result.current.src).toBe('https://cdn.example.com/new.jpg'));
    act(() => result.current.onImageLoad());
    act(() => result.current.onImageError());

    await waitFor(() =>
      expect(result.current.src).toBe('https://cdn.example.com/loaded-again.jpg'),
    );
    expect(read).toHaveBeenCalledWith('asset-reset', { pageId: 'page-1' });
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
