import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getGetPageTreeQueryKey,
  getListProjectsQueryKey,
  type PageTreeNodeDto,
  type ProjectDto,
} from '@/shared/api';
import type { WorkspaceRouteContext } from '@/shared/routing';

import {
  type PageDeleteCleanupRecord,
  type ProjectDeleteCleanupRecord,
  useWorkspaceDeleteCleanupCoordinator,
  WorkspaceDeleteCleanupProvider,
} from './delete-cleanup-coordinator';

function page(
  id: string,
  projectId: string,
  parentPageId: string | null,
  title: string,
  children: PageTreeNodeDto[] = [],
): PageTreeNodeDto {
  return {
    children,
    createdAt: '2026-08-29T00:00:00.000Z',
    createdById: 'user-1',
    id,
    ownerId: 'user-1',
    parentPageId,
    position: id,
    projectId,
    title,
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

const pageTree = [
  page('parent', 'project-a', null, 'Parent page', [
    page('child', 'project-a', 'parent', 'Child page'),
  ]),
  page('sibling', 'project-a', null, 'Sibling page'),
  page('other-project-page', 'project-b', null, 'Other project page'),
];

const projects: ProjectDto[] = [
  { id: 'project-a', name: 'Project Alpha', ownerId: 'user-1' },
  { id: 'project-b', name: 'Project Beta', ownerId: 'user-1' },
];

afterEach(cleanup);

describe('WorkspaceDeleteCleanupProvider', () => {
  it('не удаляет affected page subtree до смены route и завершает cleanup после remount', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(getListProjectsQueryKey(), projects);
    queryClient.setQueryData(getGetPageTreeQueryKey(), pageTree);
    const cleanupRecord: PageDeleteCleanupRecord = {
      kind: 'page',
      oldRoute: { pageId: 'child', type: 'page' },
      projectId: 'project-a',
      subtreePageIds: ['parent', 'child'],
      subtreeRootPageId: 'parent',
    };
    const view = render(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ pageId: 'child', type: 'page' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Schedule cleanup' }));

    await waitFor(() => expect(screen.getByText('Child page')).toBeInTheDocument());
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
    expect(getPageIds(queryClient)).toEqual(['parent', 'child', 'sibling', 'other-project-page']);
    expect(invalidateQueries).not.toHaveBeenCalled();

    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted={false}
        queryClient={queryClient}
        route={{ pageId: 'child', type: 'page' }}
      />,
    );
    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ projectId: 'project-a', type: 'project' }}
      />,
    );

    await waitFor(() => expect(getPageIds(queryClient)).toEqual(['sibling', 'other-project-page']));
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledOnce();

    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ projectId: 'project-a', type: 'project' }}
      />,
    );
    expect(getPageIds(queryClient)).toEqual(['sibling', 'other-project-page']);
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it('не удаляет affected project caches до смены route и завершает cleanup после remount', async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    queryClient.setQueryData(getListProjectsQueryKey(), projects);
    queryClient.setQueryData(getGetPageTreeQueryKey(), pageTree);
    const cleanupRecord: ProjectDeleteCleanupRecord = {
      kind: 'project',
      oldRoute: { pageId: 'child', type: 'page' },
      projectId: 'project-a',
    };
    const view = render(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ pageId: 'child', type: 'page' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Schedule cleanup' }));

    await waitFor(() => expect(screen.getByText('Child page')).toBeInTheDocument());
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
    expect(getProjectIds(queryClient)).toEqual(['project-a', 'project-b']);
    expect(getPageIds(queryClient)).toEqual(['parent', 'child', 'sibling', 'other-project-page']);
    expect(invalidateQueries).not.toHaveBeenCalled();

    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted={false}
        queryClient={queryClient}
        route={{ pageId: 'child', type: 'page' }}
      />,
    );
    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ type: 'root' }}
      />,
    );

    await waitFor(() => expect(getProjectIds(queryClient)).toEqual(['project-b']));
    expect(getPageIds(queryClient)).toEqual(['other-project-page']);
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledTimes(2);

    view.rerender(
      <TestApp
        cleanupRecord={cleanupRecord}
        mounted
        queryClient={queryClient}
        route={{ type: 'root' }}
      />,
    );
    expect(getProjectIds(queryClient)).toEqual(['project-b']);
    expect(getPageIds(queryClient)).toEqual(['other-project-page']);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function TestApp({
  cleanupRecord,
  mounted,
  queryClient,
  route,
}: Readonly<{
  cleanupRecord: PageDeleteCleanupRecord | ProjectDeleteCleanupRecord;
  mounted: boolean;
  queryClient: QueryClient;
  route: WorkspaceRouteContext;
}>) {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceDeleteCleanupProvider>
        {mounted ? <RouteOwner cleanupRecord={cleanupRecord} route={route} /> : null}
      </WorkspaceDeleteCleanupProvider>
    </QueryClientProvider>
  );
}

function RouteOwner({
  cleanupRecord,
  route,
}: Readonly<{
  cleanupRecord: PageDeleteCleanupRecord | ProjectDeleteCleanupRecord;
  route: WorkspaceRouteContext;
}>) {
  const coordinator = useWorkspaceDeleteCleanupCoordinator();

  useEffect(() => {
    coordinator.setRouteContext(route);
  }, [coordinator, route]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (cleanupRecord.kind === 'page') coordinator.schedulePageDeleteCleanup(cleanupRecord);
          else coordinator.scheduleProjectDeleteCleanup(cleanupRecord);
        }}
      >
        Schedule cleanup
      </button>
      <ActiveRouteView route={route} />
    </>
  );
}

function ActiveRouteView({ route }: Readonly<{ route: WorkspaceRouteContext }>) {
  const queryClient = useQueryClient();

  if (route.type === 'root') return <div>Workspace root</div>;

  if (route.type === 'project') {
    const cachedProjects = queryClient.getQueryData<ProjectDto[]>(getListProjectsQueryKey()) ?? [];
    const project = cachedProjects.find((item) => item.id === route.projectId);
    return <div>{project?.name ?? 'Ничего не найдено'}</div>;
  }

  const cachedPageTree =
    queryClient.getQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey()) ?? [];
  const currentPage = findPage(cachedPageTree, route.pageId);
  return <div>{currentPage?.title ?? 'Ничего не найдено'}</div>;
}

function getPageIds(queryClient: QueryClient): string[] {
  return flattenPageIds(
    queryClient.getQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey()) ?? [],
  );
}

function getProjectIds(queryClient: QueryClient): string[] {
  return (queryClient.getQueryData<ProjectDto[]>(getListProjectsQueryKey()) ?? []).map(
    (project) => project.id,
  );
}

function flattenPageIds(tree: readonly PageTreeNodeDto[]): string[] {
  return tree.flatMap((node) => [node.id, ...flattenPageIds(node.children ?? [])]);
}

function findPage(tree: readonly PageTreeNodeDto[], pageId: string): PageTreeNodeDto | undefined {
  for (const node of tree) {
    if (node.id === pageId) return node;
    const found = findPage(node.children ?? [], pageId);
    if (found) return found;
  }
  return undefined;
}
