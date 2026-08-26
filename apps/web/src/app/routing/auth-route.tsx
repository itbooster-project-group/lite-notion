'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useSession } from '@/entities/session';

import { SessionError, SessionLoading } from './session-state';

type AuthRouteProps = Readonly<{
  children: ReactNode;
}>;

export function AuthRoute({ children }: AuthRouteProps) {
  const router = useRouter();
  const { restoreSession, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [router, status]);

  if (status === 'loading' || status === 'authenticated') {
    return <SessionLoading />;
  }

  if (status === 'error') {
    return <SessionError onRetry={() => void restoreSession()} />;
  }

  return children;
}
