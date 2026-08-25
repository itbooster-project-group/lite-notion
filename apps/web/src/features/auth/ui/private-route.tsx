'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useSession } from '@/entities/session';

import { getLoginPath } from '../model/return-path';
import { SessionError, SessionLoading } from './session-state';

type PrivateRouteProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateRoute({ children }: PrivateRouteProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { restoreSession, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(getLoginPath(pathname));
    }
  }, [pathname, router, status]);

  if (status === 'loading' || status === 'unauthenticated') {
    return <SessionLoading />;
  }

  if (status === 'error') {
    return <SessionError onRetry={() => void restoreSession()} />;
  }

  return children;
}
