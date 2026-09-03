'use client';

import {
  Cancel01Icon,
  Menu01Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { Button, Modal, ModalPrimitive } from '@/shared/ui';
import { useAppShellStore } from '../model/app-shell-store';
import { SidebarContent } from './sidebar-content';

const DESKTOP_SIDEBAR_ID = 'desktop-sidebar';
const MOBILE_SIDEBAR_ID = 'mobile-sidebar';
const DESKTOP_MEDIA_QUERY = '(min-width: 48rem)';

export type AppShellProps = Readonly<{
  actions?: ReactNode;
  children: ReactNode;
  pageTree?: ReactNode;
  user?: ReactNode;
}>;

export function AppShell({ actions, children, pageTree, user }: AppShellProps) {
  const pathname = usePathname();
  const desktopCollapsed = useAppShellStore((state) => state.desktopCollapsed);
  const mobileOpen = useAppShellStore((state) => state.mobileOpen);
  const toggleDesktop = useAppShellStore((state) => state.toggleDesktop);
  const closeMobile = useAppShellStore((state) => state.closeMobile);
  const setMobileOpen = useAppShellStore((state) => state.setMobileOpen);
  const [hydrated, setHydrated] = useState(false);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    let active = true;

    void Promise.resolve(useAppShellStore.persist.rehydrate()).finally(() => {
      if (active) {
        setHydrated(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      closeMobile();
      previousPathname.current = pathname;
    }
  }, [pathname, closeMobile]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const closeAtDesktopWidth = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        closeMobile();
      }
    };

    closeAtDesktopWidth(mediaQuery);
    mediaQuery.addEventListener('change', closeAtDesktopWidth);

    return () => mediaQuery.removeEventListener('change', closeAtDesktopWidth);
  }, [closeMobile]);

  const collapsed = hydrated ? desktopCollapsed : false;

  return (
    <div className="flex min-h-dvh bg-background text-foreground" data-hydrated={hydrated}>
      <aside
        aria-label="Боковая панель"
        className={cn(
          'hidden h-dvh shrink-0 flex-col border-sidebar-border border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex',
          collapsed ? 'w-14' : 'w-64',
          hydrated && 'transition-[width] duration-200 motion-reduce:transition-none',
        )}
        id={DESKTOP_SIDEBAR_ID}
      >
        <div className="flex h-12 shrink-0 items-center justify-end px-3">
          <Button
            aria-controls={DESKTOP_SIDEBAR_ID}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
            onClick={toggleDesktop}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon} />
          </Button>
        </div>
        {!collapsed ? <SidebarContent actions={actions} pageTree={pageTree} user={user} /> : null}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex h-12 items-center border-b px-3 md:hidden">
          <Modal
            onOpenChange={setMobileOpen}
            open={mobileOpen}
            title="Боковая панель"
            trigger={
              <Button
                aria-controls={MOBILE_SIDEBAR_ID}
                aria-expanded={mobileOpen}
                aria-label="Открыть боковую панель"
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon icon={Menu01Icon} />
              </Button>
            }
          >
            <aside
              aria-label="Боковая панель"
              className="flex h-full flex-col"
              id={MOBILE_SIDEBAR_ID}
            >
              <div className="flex h-12 shrink-0 items-center justify-end px-3">
                <ModalPrimitive.Close
                  aria-label="Закрыть боковую панель"
                  className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring"
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </ModalPrimitive.Close>
              </div>
              <SidebarContent actions={actions} pageTree={pageTree} user={user} />
            </aside>
          </Modal>
        </div>
        <main className="min-h-[calc(100dvh-3rem)] md:min-h-dvh">{children}</main>
      </div>
    </div>
  );
}
