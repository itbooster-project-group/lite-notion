'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type AuthResponseDto,
  clearAccessToken,
  configureAuthTransport,
  getGetCurrentUserQueryKey,
  getGetCurrentUserQueryOptions,
  refreshAccessToken,
  refreshTokens,
  setAccessToken,
  type UserProfileDto,
  useGetCurrentUser,
} from '@/shared/api';
import { Text } from '@/shared/ui';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

type SessionContextValue = Readonly<{
  authenticate: (response: AuthResponseDto) => void;
  clearSession: () => void;
  restoreSession: () => Promise<void>;
  status: SessionStatus;
  user: UserProfileDto | undefined;
}>;

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type SessionProviderProps = Readonly<{
  children: ReactNode;
}>;

export function SessionProvider({ children }: SessionProviderProps) {
  const queryClient = useQueryClient();
  const currentUserQuery = useGetCurrentUser({ query: { enabled: false, retry: false } });
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [transportReady, setTransportReady] = useState(false);
  const lifecycleGeneration = useRef(0);
  const restorePromise = useRef<Promise<void> | undefined>(undefined);

  const clearSession = useCallback(() => {
    lifecycleGeneration.current += 1;
    clearAccessToken();
    queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
    setStatus('unauthenticated');
  }, [queryClient]);

  useEffect(() => {
    const removeConfiguration = configureAuthTransport({
      onSessionExpired: clearSession,
      refreshAccessToken: async () => {
        const response = await refreshTokens({ skipAuthRefresh: true });
        return response.accessToken;
      },
    });

    setTransportReady(true);

    return () => {
      lifecycleGeneration.current += 1;
      removeConfiguration();
    };
  }, [clearSession]);

  const restoreSession = useCallback(() => {
    if (restorePromise.current !== undefined) {
      return restorePromise.current;
    }

    setStatus('loading');
    const restoreGeneration = lifecycleGeneration.current;

    const pendingRestore = (async () => {
      try {
        const refreshOutcome = await refreshAccessToken();

        if (refreshOutcome === 'superseded' || lifecycleGeneration.current !== restoreGeneration) {
          return;
        }

        await queryClient.fetchQuery(
          getGetCurrentUserQueryOptions({ query: { retry: false, staleTime: 60_000 } }),
        );

        if (lifecycleGeneration.current !== restoreGeneration) {
          return;
        }

        setStatus('authenticated');
      } catch (error) {
        if (lifecycleGeneration.current !== restoreGeneration) {
          return;
        }

        if (isUnauthorized(error)) {
          clearSession();
          return;
        }

        clearAccessToken();
        setStatus('error');
      }
    })().finally(() => {
      restorePromise.current = undefined;
    });

    restorePromise.current = pendingRestore;
    return pendingRestore;
  }, [clearSession, queryClient]);

  useEffect(() => {
    if (transportReady) {
      void restoreSession();
    }
  }, [restoreSession, transportReady]);

  const authenticate = useCallback(
    (response: AuthResponseDto) => {
      lifecycleGeneration.current += 1;
      setAccessToken(response.accessToken);
      queryClient.setQueryData(getGetCurrentUserQueryKey(), response.user);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      authenticate,
      clearSession,
      restoreSession,
      status,
      user: currentUserQuery.data,
    }),
    [authenticate, clearSession, currentUserQuery.data, restoreSession, status],
  );

  if (!transportReady) {
    return <SessionLoading />;
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const session = useContext(SessionContext);

  if (session === undefined) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return session;
}

function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-page-inline" aria-busy="true">
      <Text variant="caption">Подготавливаем приложение…</Text>
    </main>
  );
}

function isUnauthorized(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
