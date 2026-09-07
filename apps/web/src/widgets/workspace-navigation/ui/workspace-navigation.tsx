'use client';

import { Cancel01Icon, SidebarLeftIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useState } from 'react';
import type { MoveIntent, NormalizedPageTree } from '@/entities/page';
import type { PageDeleteRequest, ProjectDeleteRequest } from '@/features/workspace-management';
import type { ProjectDto } from '@/shared/api';
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@/shared/ui';
import { WorkspaceTree } from './workspace-tree';

type WorkspaceNavigationProps = Readonly<{
  activePageId: string | undefined;
  activeProjectId: string | undefined;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (projectId: string, parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onRequestDeletePage: (request: PageDeleteRequest) => void;
  onRequestDeleteProject: (request: ProjectDeleteRequest) => void;
  projects: readonly ProjectDto[];
}>;

export function WorkspaceNavigation(props: WorkspaceNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tree = <WorkspaceTree {...props} onNavigate={() => setMobileOpen(false)} />;

  return (
    <>
      <aside
        className="hidden min-h-0 overflow-y-auto border-r bg-card p-5 md:block"
        aria-label="Навигация по проекту"
      >
        {mobileOpen ? null : tree}
      </aside>

      <div className="absolute top-3 right-3 z-10 md:hidden">
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerTrigger
            aria-label="Открыть навигацию"
            render={<Button size="icon" type="button" variant="ghost" />}
          >
            <HugeiconsIcon aria-hidden="true" icon={SidebarLeftIcon} strokeWidth={2} />
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle className="sr-only">Навигация</DrawerTitle>
            <div className="flex justify-end p-3">
              <DrawerClose
                aria-label="Закрыть навигацию"
                render={<Button size="icon-sm" type="button" variant="ghost" />}
              >
                <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} strokeWidth={2} />
              </DrawerClose>
            </div>
            <div className="overflow-y-auto px-5 pb-5">{mobileOpen ? tree : null}</div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
