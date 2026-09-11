'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { NormalizedPageTree, PageRouteContext } from '@/entities/page';
import type { ProjectDto } from '@/shared/api';

export type WorkspaceData = Readonly<{
  pageTree: NormalizedPageTree;
  sharedTree: NormalizedPageTree;
  pageContext: PageRouteContext | undefined;
  projects: readonly ProjectDto[];
  projectsPending: boolean;
  projectsError: boolean;
  pageTreePending: boolean;
  pageTreeError: boolean;
  sharedPagesPending: boolean;
  sharedPagesError: boolean;
  refetchProjects: () => Promise<unknown>;
  refetchPageTree: () => Promise<unknown>;
  refetchSharedPages: () => Promise<unknown>;
}>;

const WorkspaceDataContext = createContext<WorkspaceData | undefined>(undefined);

export function WorkspaceDataProvider({
  children,
  value,
}: Readonly<{ children: ReactNode; value: WorkspaceData }>) {
  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceData(): WorkspaceData {
  const value = useContext(WorkspaceDataContext);
  if (!value) throw new Error('useWorkspaceData must be used within WorkspaceDataProvider');
  return value;
}
