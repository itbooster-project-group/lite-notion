'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { getBreadcrumbs, normalizePageTree, resolvePageRouteContext } from '@/entities/page';
import {
  DeleteConfirmationDialog,
  type DeleteConfirmationIntent,
  type PageDeleteRequest,
  type ProjectDeleteRequest,
  usePageManagement,
  useProjectDeletion,
  useWorkspaceDeleteCleanupCoordinator,
} from '@/features/workspace-management';
import { WorkspaceDataProvider } from '@/pages/workspace';
import {
  type PageTreeNodeDto,
  type ProjectDto,
  useGetPageTree,
  useGetSharedPages,
  useListProjects,
} from '@/shared/api';
import {
  parseWorkspaceRoutePathname,
  workspacePagePath,
  workspaceProjectPath,
} from '@/shared/routing';
import { Button, Text } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';
import { PrivateShell } from '@/widgets/private-shell';
import {
  SharedPagesTree,
  WorkspaceTree,
  WorkspaceTreeExpansionProvider,
} from '@/widgets/workspace-navigation';

type WorkspaceDeleteIntent =
  | (PageDeleteRequest & Readonly<{ kind: 'page' }>)
  | (ProjectDeleteRequest & Readonly<{ kind: 'project' }>);

function toDeleteConfirmationIntent(
  intent: WorkspaceDeleteIntent | undefined,
): DeleteConfirmationIntent | undefined {
  if (!intent) return undefined;
  if (intent.kind === 'project') {
    return { kind: 'project', name: intent.name, returnFocus: intent.returnFocus };
  }

  return { kind: 'page', returnFocus: intent.returnFocus, title: intent.title };
}

export function PrivateWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const projectsQuery = useListProjects<ProjectDto[]>();
  const treeQuery = useGetPageTree<PageTreeNodeDto[]>();
  const sharedPagesQuery = useGetSharedPages<PageTreeNodeDto[]>();
  const [deleteIntent, setDeleteIntent] = useState<WorkspaceDeleteIntent>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);
  const deletePendingRef = useRef(false);
  const tree = useMemo(() => normalizePageTree(treeQuery.data ?? []), [treeQuery.data]);
  const sharedTree = useMemo(
    () => normalizePageTree(sharedPagesQuery.data ?? []),
    [sharedPagesQuery.data],
  );
  const routeContext = useMemo(() => parseWorkspaceRoutePathname(pathname), [pathname]);
  const deleteCleanupCoordinator = useWorkspaceDeleteCleanupCoordinator();
  const pageManagement = usePageManagement(routeContext);
  const projectDeletion = useProjectDeletion(routeContext);
  const pageId = routeContext?.type === 'page' ? routeContext.pageId : undefined;
  const pageContext = useMemo(
    () => resolvePageRouteContext(tree, sharedTree, pageId),
    [pageId, sharedTree, tree],
  );
  const page = pageContext?.page;
  const effectiveProjectId =
    routeContext?.type === 'project'
      ? routeContext.projectId
      : pageContext?.source === 'owned'
        ? page?.projectId
        : undefined;
  const project = projectsQuery.data?.find((item) => item.id === effectiveProjectId);
  const pending = projectsQuery.isPending || treeQuery.isPending;
  const failed = projectsQuery.isError || treeQuery.isError;

  useEffect(() => {
    deleteCleanupCoordinator.setRouteContext(routeContext);
  }, [deleteCleanupCoordinator, routeContext]);

  const crumbs = [{ title: 'Проекты', href: '/' }];
  if (pathname === '/profile') crumbs.push({ title: 'Профиль', href: '/profile' });
  else if (
    !treeQuery.isPending &&
    !treeQuery.isError &&
    !sharedPagesQuery.isPending &&
    !sharedPagesQuery.isError &&
    pageContext?.source === 'shared' &&
    page
  ) {
    crumbs.push({ title: 'Доступные мне', href: '/' });
    crumbs.push(
      ...getBreadcrumbs(sharedTree, page.id).map((item) => ({
        title: item.title,
        href: workspacePagePath(item.id),
      })),
    );
  } else if (!pending && !failed && project && (!pageId || page)) {
    crumbs.push({ title: project.name, href: workspaceProjectPath(project.id) });
    if (page)
      crumbs.push(
        ...getBreadcrumbs(tree, page.id).map((item) => ({
          title: item.title,
          href: workspacePagePath(item.id),
        })),
      );
  } else if (pathname !== '/') {
    crumbs.push({ title: 'Рабочая область', href: pathname });
  }

  const breadcrumbs = (
    <nav aria-label="Хлебные крошки" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-2" key={`${crumb.href}-${crumb.title}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === crumbs.length - 1 ? (
              <span className="break-all" aria-current="page">
                {crumb.title}
              </span>
            ) : (
              <Link
                className="break-all rounded-sm hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                href={crumb.href}
              >
                {crumb.title}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );

  function requestPageDelete(request: PageDeleteRequest) {
    setDeleteError(undefined);
    setDeleteIntent({ ...request, kind: 'page' });
  }

  function requestProjectDelete(request: ProjectDeleteRequest) {
    setDeleteError(undefined);
    setDeleteIntent({ ...request, kind: 'project' });
  }
  function closeDeleteDialog() {
    if (deletePendingRef.current) return;
    setDeleteError(undefined);
    setDeleteIntent(undefined);
  }

  async function submitDelete() {
    if (!deleteIntent || deletePendingRef.current) return;

    deletePendingRef.current = true;
    setDeletePending(true);
    setDeleteError(undefined);
    try {
      if (deleteIntent.kind === 'page') {
        await pageManagement.deletePage(deleteIntent.pageId);
      } else {
        await projectDeletion.deleteProject(deleteIntent.projectId);
      }
      setDeleteIntent(undefined);
    } catch {
      setDeleteError(
        deleteIntent.kind === 'page'
          ? 'Ошибка удаления страницы. Попробуйте ещё раз.'
          : 'Ошибка удаления проекта. Попробуйте ещё раз.',
      );
    } finally {
      deletePendingRef.current = false;
      setDeletePending(false);
    }
  }

  const navigation = pending ? (
    <Text aria-busy="true">Загружаем дерево…</Text>
  ) : failed ? (
    <div className="space-y-2">
      <Text role="alert">Не удалось загрузить дерево.</Text>
      <Button
        onClick={() => {
          void projectsQuery.refetch();
          void treeQuery.refetch();
        }}
      >
        Повторить загрузку дерева
      </Button>
    </div>
  ) : (
    <>
      <WorkspaceTree
        activePageId={pageContext?.source === 'owned' ? page?.id : undefined}
        activeProjectId={project?.id}
        normalizedTree={tree}
        projects={projectsQuery.data ?? []}
        onCreatePage={pageManagement.createPage}
        onMovePage={pageManagement.movePage}
        onRequestDeletePage={requestPageDelete}
        onRequestDeleteProject={requestProjectDelete}
        onRenamePage={pageManagement.renamePage}
        onOpenPageAccess={(selectedPageId) => router.push(workspacePagePath(selectedPageId))}
      />
      <SharedPagesTree
        isError={sharedPagesQuery.isError}
        isLoading={sharedPagesQuery.isPending}
        onRetry={() => void sharedPagesQuery.refetch()}
        onSelectPage={(selectedPageId) => router.push(workspacePagePath(selectedPageId))}
        pages={sharedPagesQuery.data ?? []}
      />
    </>
  );

  const workspaceData = {
    pageTree: tree,
    sharedTree,
    pageContext,
    projects: projectsQuery.data ?? [],
    projectsPending: projectsQuery.isPending,
    projectsError: projectsQuery.isError,
    pageTreePending: treeQuery.isPending,
    pageTreeError: treeQuery.isError,
    sharedPagesPending: sharedPagesQuery.isPending,
    sharedPagesError: sharedPagesQuery.isError,
    refetchProjects: projectsQuery.refetch,
    refetchPageTree: treeQuery.refetch,
    refetchSharedPages: sharedPagesQuery.refetch,
  } satisfies Parameters<typeof WorkspaceDataProvider>[0]['value'];

  return (
    <WorkspaceDataProvider value={workspaceData}>
      <WorkspaceTreeExpansionProvider>
        <AppShell pageTree={navigation}>
          {({ mobileNavigationTrigger }) => (
            <>
              <PrivateShell breadcrumbs={breadcrumbs} headerStart={mobileNavigationTrigger}>
                {children}
              </PrivateShell>
              <DeleteConfirmationDialog
                error={deleteError}
                intent={toDeleteConfirmationIntent(deleteIntent)}
                pending={deletePending}
                onCancel={closeDeleteDialog}
                onConfirm={() => void submitDelete()}
              />
            </>
          )}
        </AppShell>
      </WorkspaceTreeExpansionProvider>
    </WorkspaceDataProvider>
  );
}
