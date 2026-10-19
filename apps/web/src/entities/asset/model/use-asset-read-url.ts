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
  const query = useQuery<ResolvedAssetUrl, Error & { status?: number }>({
    enabled: Boolean(assetId && userId && context.id && deniedFor !== accessKey),
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
  const imageRefreshUsedFor = useRef<string | undefined>(undefined);
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
      setDeniedFor(accessKey);
      void queryClient.removeQueries({ queryKey, exact: true });
    }
  }, [accessKey, query.error, queryKey, queryClient]);

  const refreshAfterImageError = useCallback(() => {
    if (query.error?.status === 401 || query.error?.status === 403) return;
    const failedUrl = query.data?.url;
    const refreshKey = `${accessKey}:${failedUrl ?? ''}`;
    if (imageRefreshUsedFor.current === refreshKey) {
      setImageUnavailableFor(refreshKey);
      return;
    }
    imageRefreshUsedFor.current = refreshKey;
    void query.refetch().then((result) => {
      if (result.data?.url === failedUrl) setImageUnavailableFor(refreshKey);
    });
  }, [accessKey, query.data?.url, query.error?.status, query.refetch]);

  return {
    onImageError: refreshAfterImageError,
    src: query.data?.url,
    state:
      query.isPending && deniedFor !== accessKey
        ? 'loading'
        : deniedFor === accessKey ||
            query.isError ||
            !query.data ||
            imageUnavailableFor === `${accessKey}:${query.data.url}`
          ? 'unavailable'
          : 'ready',
  } as const;
}
