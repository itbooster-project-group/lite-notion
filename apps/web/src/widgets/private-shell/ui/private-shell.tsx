'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAssetReadUrl } from '@/entities/asset';
import { useSession } from '@/entities/session';
import { LogoutButton } from '@/features/auth';
import { AssetImage } from '@/shared/ui';

type PrivateShellProps = Readonly<{
  children: ReactNode;
  breadcrumbs: ReactNode;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
}>;

export function PrivateShell({ children, breadcrumbs, headerStart, headerEnd }: PrivateShellProps) {
  const { user } = useSession();
  const avatar = useAssetReadUrl(user?.avatarAssetId, user?.id, {
    id: user?.id ?? '',
    kind: 'avatar',
  });

  return (
    <div className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-background">
      <header className="bg-card">
        <div className="flex items-center justify-between gap-4 border-b px-page-inline py-4 md:min-h-16 md:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {headerStart ? <div className="shrink-0">{headerStart}</div> : null}
            {breadcrumbs}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {headerEnd}
            <Link
              aria-label={user ? `Профиль: ${user.name}` : 'Профиль'}
              className="block size-8 shrink-0 overflow-hidden rounded-full bg-muted text-muted-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/50"
              href="/profile"
              title={user?.name ?? 'Профиль'}
            >
              <AssetImage
                alt={`${user?.name ?? 'Профиль'}: аватар`}
                className="size-8 rounded-full object-cover"
                fallback={
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-full text-sm font-medium"
                  >
                    {getInitial(user?.name)}
                  </span>
                }
                height={32}
                onImageError={avatar.onImageError}
                onImageLoad={avatar.onImageLoad}
                src={avatar.src}
                state={user?.avatarAssetId ? avatar.state : 'unavailable'}
                width={32}
              />
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function getInitial(name: string | undefined): string {
  return name?.trim().slice(0, 1).toUpperCase() || '?';
}
