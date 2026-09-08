'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useSession } from '@/entities/session';
import { LogoutButton } from '@/features/auth';

type PrivateShellProps = Readonly<{
  children: ReactNode;
  breadcrumbs: ReactNode;
}>;

export function PrivateShell({ children, breadcrumbs }: PrivateShellProps) {
  const { user } = useSession();

  return (
    <div className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-background">
      <header className="border-b bg-card">
        <div className="flex items-center justify-between gap-4 py-4 pr-page-inline pl-14 md:px-page-inline">
          {breadcrumbs}
          <div className="flex shrink-0 items-center gap-3">
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
