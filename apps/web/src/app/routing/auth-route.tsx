'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useSession } from '@/entities/session';
import { getSafeReturnPath } from '@/features/auth';

import { SessionError, SessionLoading } from './session-state';

type AuthRouteProps = Readonly<{
  children: ReactNode;
}>;

export function AuthRoute({ children }: AuthRouteProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { restoreSession, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(getSafeReturnPath(searchParams?.get('next')));
    }
  }, [router, searchParams, status]);

  if (status === 'loading' || status === 'authenticated') {
    return <SessionLoading />;
  }

  if (status === 'error') {
    return <SessionError onRetry={() => void restoreSession()} />;
  }

  return children;
}
