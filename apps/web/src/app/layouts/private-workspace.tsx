'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useMemo } from 'react';
import { getBreadcrumbs, normalizePageTree, selectPage } from '@/entities/page';
import { usePageManagement } from '@/features/workspace-management';
import {
  type PageTreeNodeDto,
  type ProjectDto,
  useGetPageTree,
  useListProjects,
} from '@/shared/api';
import { Button, Text } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';
import { PrivateShell } from '@/widgets/private-shell';
import { WorkspaceTree, WorkspaceTreeExpansionProvider } from '@/widgets/workspace-navigation';

export function PrivateWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? '/';
  const projectsQuery = useListProjects<ProjectDto[]>();
  const treeQuery = useGetPageTree<PageTreeNodeDto[]>();
  const tree = useMemo(() => normalizePageTree(treeQuery.data ?? []), [treeQuery.data]);
  const management = usePageManagement();
  const pageId = /^\/pages\/([^/]+)$/.exec(pathname)?.[1];
  const projectId = /^\/projects\/([^/]+)$/.exec(pathname)?.[1];
  const page = selectPage(tree, pageId);
  const project = projectsQuery.data?.find((item) => item.id === (projectId ?? page?.projectId));
  const pending = projectsQuery.isPending || treeQuery.isPending;
  const failed = projectsQuery.isError || treeQuery.isError;
  const crumbs = [{ title: 'Проекты', href: '/' }];
  if (pathname === '/profile') crumbs.push({ title: 'Профиль', href: '/profile' });
  else if (!pending && !failed && project && (!pageId || page)) {
    crumbs.push({ title: project.name, href: `/projects/${project.id}` });
    if (page)
      crumbs.push(
        ...getBreadcrumbs(tree, page.id).map((item) => ({
          title: item.title,
          href: `/pages/${item.id}`,
        })),
      );
  } else if (pathname !== '/') {
    crumbs.push({ title: 'Рабочая область', href: pathname });
  }

  const breadcrumbs = (
    <nav aria-label="Хлебные крошки" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-2" key={crumb.href}>
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
    <WorkspaceTree
      activePageId={page?.id}
      activeProjectId={project?.id}
      normalizedTree={tree}
      projects={projectsQuery.data ?? []}
      onCreatePage={management.createPage}
      onMovePage={management.movePage}
      onRenamePage={management.renamePage}
    />
  );

  return (
    <WorkspaceTreeExpansionProvider>
      <AppShell pageTree={navigation}>
        <PrivateShell breadcrumbs={breadcrumbs}>{children}</PrivateShell>
      </AppShell>
    </WorkspaceTreeExpansionProvider>
  );
}
