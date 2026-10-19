'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetReadUrlDto } from '@/shared/api';
import { createAssetReadUrl, createAvatarReadUrl, getAssetReadUrlQueryKey } from '@/shared/api';

function refreshLeadMs(expiresInSeconds: number): number {
  return Math.min(60_000, expiresInSeconds * 150);
}

export type AssetReadContext =
  | Readonly<{ kind: 'page'; id: string }>
  | Readonly<{ kind: 'avatar'; id: string }>;

type ResolvedAssetUrl = AssetReadUrlDto & Readonly<{ expiresAt: number }>;

export function useAssetReadUrl(
  assetId: string | null | undefined,
  userId: string | null | undefined,
  context: AssetReadContext,
) {
  const queryClient = useQueryClient();
  const [deniedFor, setDeniedFor] = useState<string>();
  const authorizationContext = `${context.kind}:${context.id}`;
  const accessKey = `${assetId ?? ''}:${userId ?? ''}:${authorizationContext}`;
  const queryKey = getAssetReadUrlQueryKey(assetId ?? '', authorizationContext, userId ?? '');
  const imageRefreshUsedFor = useRef<string | undefined>(undefined);
  const imageCycle = useRef({ accessKey, id: 0 });
  if (imageCycle.current.accessKey !== accessKey) {
    imageCycle.current = { accessKey, id: imageCycle.current.id + 1 };
    imageRefreshUsedFor.current = undefined;
  }
  const imageCycleKey = `${accessKey}:${imageCycle.current.id}`;
  const query = useQuery<ResolvedAssetUrl, Error & { status?: number }>({
    enabled: Boolean(assetId && userId && context.id && deniedFor !== imageCycleKey),
    queryKey,
    queryFn: async () => {
      if (!assetId) throw new Error('Asset identity is unavailable.');
      const response =
        context.kind === 'page'
          ? await createAssetReadUrl(assetId, { pageId: context.id })
          : await createAvatarReadUrl(context.id, assetId);
      return { ...response, expiresAt: Date.now() + response.expiresInSeconds * 1000 };
    },
    staleTime: (queryState) =>
      Math.max(
        0,
        (queryState.state.data?.expiresAt ?? Date.now()) -
          Date.now() -
          refreshLeadMs(queryState.state.data?.expiresInSeconds ?? 0),
      ),
    retry: (failureCount, error) =>
      failureCount < 1 && error.status !== 401 && error.status !== 403 && error.status !== 404,
  });
  const [imageUnavailableFor, setImageUnavailableFor] = useState<string>();

  useEffect(() => {
    if (!query.data || query.data.expiresAt <= Date.now()) return;
    const delay = Math.max(
      0,
      query.data.expiresAt - Date.now() - refreshLeadMs(query.data.expiresInSeconds),
    );
    const timeout = window.setTimeout(() => void query.refetch(), delay);
    return () => window.clearTimeout(timeout);
  }, [query.data, query.refetch]);

  useEffect(() => {
    if (query.error?.status === 401 || query.error?.status === 403) {
      setDeniedFor(imageCycleKey);
      void queryClient.removeQueries({ queryKey, exact: true });
    }
  }, [imageCycleKey, query.error, queryKey, queryClient]);

  const refreshAfterImageError = useCallback(() => {
    if (query.error?.status === 401 || query.error?.status === 403) return;
    if (imageRefreshUsedFor.current === accessKey) {
      setImageUnavailableFor(imageCycleKey);
      return;
    }
    imageRefreshUsedFor.current = accessKey;
    setImageUnavailableFor(imageCycleKey);
    void query.refetch().then((result) => {
      if (!result.data || result.data.url === query.data?.url || result.error) {
        setImageUnavailableFor(imageCycleKey);
      } else {
        setImageUnavailableFor((current) => (current === imageCycleKey ? undefined : current));
      }
    });
  }, [accessKey, imageCycleKey, query.data?.url, query.error?.status, query.refetch]);

  const resetImageError = useCallback(() => {
    if (imageRefreshUsedFor.current === accessKey) imageRefreshUsedFor.current = undefined;
    setImageUnavailableFor((current) => (current === imageCycleKey ? undefined : current));
  }, [accessKey, imageCycleKey]);

  return {
    onImageLoad: resetImageError,
    onImageError: refreshAfterImageError,
    src: query.data?.url,
    state:
      query.isPending && deniedFor !== imageCycleKey
        ? 'loading'
        : deniedFor === imageCycleKey ||
            query.isError ||
            !query.data ||
            imageUnavailableFor === imageCycleKey
          ? 'unavailable'
          : 'ready',
  } as const;
}
