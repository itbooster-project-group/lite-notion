'use client';

import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { buildProjectPageTree, normalizePageTree, selectPage } from '@/entities/page';
import { usePageManagement, useProjectCreation } from '@/features/workspace-management';
import {
  type PageTreeNodeDto,
  type ProjectDto,
  useGetPageTree,
  useListProjects,
} from '@/shared/api';
import { Button, Heading, Input, Text } from '@/shared/ui';
import { WorkspaceNavigation } from '@/widgets/workspace-navigation';

import { WorkspaceMain } from './workspace-main';

export type WorkspaceRouteContext =
  | Readonly<{ type: 'root' }>
  | Readonly<{ projectId: string; type: 'project' }>
  | Readonly<{ pageId: string; type: 'page' }>;

type WorkspacePageProps = Readonly<{
  route: WorkspaceRouteContext;
}>;

export function WorkspacePage({ route }: WorkspacePageProps) {
  const projectsQuery = useListProjects<ProjectDto[]>();
  const pageTreeQuery = useGetPageTree<PageTreeNodeDto[]>();
  const pageManagement = usePageManagement();
  const projectCreation = useProjectCreation();

  const pageTree = pageTreeQuery.data ?? [];
  const normalizedTree = useMemo(() => normalizePageTree(pageTree), [pageTree]);
  const activePage = route.type === 'page' ? selectPage(normalizedTree, route.pageId) : undefined;
  const projectId = route.type === 'project' ? route.projectId : activePage?.projectId;
  const projects = projectsQuery.data ?? [];
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;
  const projectTree = useMemo(
    () => buildProjectPageTree(normalizedTree, projectId ?? 'unavailable'),
    [normalizedTree, projectId],
  );

  if (projectsQuery.isPending || pageTreeQuery.isPending) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Text variant="caption">Загружаем рабочую область…</Text>
      </main>
    );
  }

  if (projectsQuery.isError || pageTreeQuery.isError) {
    return (
      <WorkspaceError
        onRetry={() => {
          void projectsQuery.refetch();
          void pageTreeQuery.refetch();
        }}
      />
    );
  }

  if (route.type !== 'root' && (!project || (route.type === 'page' && !activePage))) {
    return <WorkspaceUnavailable />;
  }

  async function createPage(parentPageId: string | null, title: string) {
    if (!projectId) throw new Error('Create unavailable');
    await pageManagement.createPage(projectId, parentPageId, title);
  }

  return (
    <div className="relative min-h-0 md:grid md:grid-cols-[20rem_minmax(0,1fr)]">
      <WorkspaceNavigation
        activePageId={activePage?.id}
        activeProjectId={project?.id}
        normalizedTree={normalizedTree}
        projects={projects}
        onCreatePage={pageManagement.createPage}
        onMovePage={pageManagement.movePage}
        onRenamePage={pageManagement.renamePage}
      />

      <div className="relative min-h-0 min-w-0 overflow-y-auto">
        {route.type === 'root' ? (
          <WorkspaceRoot
            isCreating={projectCreation.isCreatingProject}
            projects={projects}
            onCreateProject={projectCreation.createProject}
          />
        ) : (
          <WorkspaceMain
            activePageId={activePage?.id}
            normalizedTree={normalizedTree}
            onCreatePage={createPage}
            onMovePage={pageManagement.movePage}
            onRenamePage={pageManagement.renamePage}
            projectTree={projectTree}
            projectName={project?.name ?? ''}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceRoot({
  isCreating,
  onCreateProject,
  projects,
}: Readonly<{
  isCreating: boolean;
  onCreateProject: (name: string) => Promise<void>;
  projects: readonly ProjectDto[];
}>) {
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('project-name') ?? '').trim();
    if (!name) {
      setError('Введите название проекта');
      return;
    }
    if (name.length > 255) {
      setError('Название может содержать до 255 символов');
      return;
    }
    setError(undefined);
    try {
      await onCreateProject(name);
    } catch {
      setError('Ошибка создания проекта. Попробуйте ещё раз.');
    }
  }

  return (
    <main className="mx-auto w-full max-w-shell space-y-8 px-page-inline py-page-block">
      <section className="space-y-3" aria-labelledby="projects-title">
        <Heading as="h1" id="projects-title" variant="page">
          Проекты
        </Heading>
        <form className="flex flex-col gap-2 sm:flex-row" noValidate onSubmit={handleSubmit}>
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-sm font-medium" htmlFor="project-name">
              Название нового проекта
            </label>
            <Input id="project-name" maxLength={255} name="project-name" />
            {error ? (
              <Text role="alert" variant="error">
                {error}
              </Text>
            ) : null}
          </div>
          <Button className="self-start sm:mt-6" disabled={isCreating} type="submit">
            {isCreating ? 'Создаём…' : 'Создать проект'}
          </Button>
        </form>
      </section>

      {projects.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Список проектов">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                className="block w-full rounded-xl border bg-card p-5 text-left font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                href={`/projects/${project.id}`}
              >
                {project.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="caption">Создайте первый проект, чтобы начать работу.</Text>
      )}
    </main>
  );
}

function WorkspaceUnavailable() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-page-inline">
      <section className="max-w-lg space-y-4 text-center">
        <Heading as="h1" variant="page">
          Ничего не найдено
        </Heading>
        <Text variant="caption">Перейдите к списку проектов и выберите рабочую область.</Text>
        <Button render={<Link href="/" />}>К проектам</Button>
      </section>
    </main>
  );
}

function WorkspaceError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-page-inline">
      <section className="max-w-lg space-y-4 text-center">
        <Heading as="h1" variant="page">
          Ошибка загрузки рабочей области
        </Heading>
        <Text variant="caption">Проверьте соединение и попробуйте ещё раз.</Text>
        <Button type="button" onClick={onRetry}>
          Повторить
        </Button>
      </section>
    </main>
  );
}
