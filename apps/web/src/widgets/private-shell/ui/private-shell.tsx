'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useSession } from '@/entities/session';
import { LogoutButton } from '@/features/auth';

type PrivateShellProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateShell({ children }: PrivateShellProps) {
  const { user } = useSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="flex items-center justify-between gap-4 px-page-inline py-4">
          <Link className="shrink-0 font-semibold tracking-tight" href="/">
            Lite Notion
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <Link
              className="block max-w-24 truncate rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-48"
              href="/profile"
              title={user?.name ?? 'Профиль'}
            >
              {user?.name ?? 'Профиль'}
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
