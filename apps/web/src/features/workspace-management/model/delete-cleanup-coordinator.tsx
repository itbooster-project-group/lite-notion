'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  normalizePageTree,
  removePageSubtreeFromTree,
  removeProjectPagesFromTree,
  selectPage,
} from '@/entities/page';
import {
  getGetPageTreeQueryKey,
  getListProjectsQueryKey,
  type PageTreeNodeDto,
  type ProjectDto,
} from '@/shared/api';
import type { WorkspaceRouteContext } from '@/shared/routing';

export type PageDeleteCleanupRecord = Readonly<{
  kind: 'page';
  oldRoute: WorkspaceRouteContext;
  projectId: string;
  subtreePageIds: readonly string[];
  subtreeRootPageId: string;
}>;

export type ProjectDeleteCleanupRecord = Readonly<{
  kind: 'project';
  oldRoute: WorkspaceRouteContext;
  projectId: string;
}>;

type PendingDeleteCleanup = PageDeleteCleanupRecord | ProjectDeleteCleanupRecord;

type WorkspaceDeleteCleanupCoordinatorValue = Readonly<{
  schedulePageDeleteCleanup: (record: PageDeleteCleanupRecord) => void;
  scheduleProjectDeleteCleanup: (record: ProjectDeleteCleanupRecord) => void;
  setRouteContext: (routeContext: WorkspaceRouteContext) => void;
}>;

const WorkspaceDeleteCleanupCoordinatorContext =
  createContext<WorkspaceDeleteCleanupCoordinatorValue | null>(null);

const fallbackWorkspaceDeleteCleanupCoordinator = {
  schedulePageDeleteCleanup: () => {},
  scheduleProjectDeleteCleanup: () => {},
  setRouteContext: () => {},
} satisfies WorkspaceDeleteCleanupCoordinatorValue;

export function WorkspaceDeleteCleanupProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [routeContext, setRouteContext] = useState<WorkspaceRouteContext>();
  const [pendingCleanup, setPendingCleanup] = useState<PendingDeleteCleanup>();

  const schedulePageDeleteCleanup = useCallback((record: PageDeleteCleanupRecord) => {
    setPendingCleanup(record);
  }, []);

  const scheduleProjectDeleteCleanup = useCallback((record: ProjectDeleteCleanupRecord) => {
    setPendingCleanup(record);
  }, []);

  useEffect(() => {
    if (!routeContext || !pendingCleanup) {
      return;
    }

    const pageTreeSnapshot = queryClient.getQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey());
    if (isRouteCleanupBlocked(routeContext, pendingCleanup, pageTreeSnapshot ?? [])) {
      return;
    }

    if (pendingCleanup.kind === 'page') {
      const queryKey = getGetPageTreeQueryKey();
      queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
        removePageSubtreeFromTree(current ?? [], pendingCleanup.subtreeRootPageId),
      );
      void queryClient.invalidateQueries({ queryKey });
      setPendingCleanup(undefined);
      return;
    }

    const projectsQueryKey = getListProjectsQueryKey();
    const pageTreeQueryKey = getGetPageTreeQueryKey();
    queryClient.setQueryData<ProjectDto[]>(projectsQueryKey, (current) =>
      (current ?? []).filter((project) => project.id !== pendingCleanup.projectId),
    );
    queryClient.setQueryData<PageTreeNodeDto[]>(pageTreeQueryKey, (current) =>
      removeProjectPagesFromTree(current ?? [], pendingCleanup.projectId),
    );
    void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    void queryClient.invalidateQueries({ queryKey: pageTreeQueryKey });
    setPendingCleanup(undefined);
  }, [pendingCleanup, queryClient, routeContext]);

  const value = useMemo(
    () => ({ schedulePageDeleteCleanup, scheduleProjectDeleteCleanup, setRouteContext }),
    [schedulePageDeleteCleanup, scheduleProjectDeleteCleanup],
  );

  return (
    <WorkspaceDeleteCleanupCoordinatorContext.Provider value={value}>
      {children}
    </WorkspaceDeleteCleanupCoordinatorContext.Provider>
  );
}

export function useWorkspaceDeleteCleanupCoordinator(): WorkspaceDeleteCleanupCoordinatorValue {
  return (
    useContext(WorkspaceDeleteCleanupCoordinatorContext) ??
    fallbackWorkspaceDeleteCleanupCoordinator
  );
}

function isRouteCleanupBlocked(
  routeContext: WorkspaceRouteContext,
  cleanup: PendingDeleteCleanup,
  pageTree: readonly PageTreeNodeDto[],
): boolean {
  if (isSameRoute(routeContext, cleanup.oldRoute)) return true;

  if (cleanup.kind === 'page') {
    return routeContext.type === 'page' && cleanup.subtreePageIds.includes(routeContext.pageId);
  }

  if (routeContext.type === 'project') return routeContext.projectId === cleanup.projectId;
  if (routeContext.type !== 'page') return false;

  return (
    selectPage(normalizePageTree(pageTree), routeContext.pageId)?.projectId === cleanup.projectId
  );
}

function isSameRoute(left: WorkspaceRouteContext, right: WorkspaceRouteContext): boolean {
  if (left.type !== right.type) return false;

  switch (left.type) {
    case 'root':
      return true;
    case 'project':
      return right.type === 'project' && left.projectId === right.projectId;
    case 'page':
      return right.type === 'page' && left.pageId === right.pageId;
  }
}
