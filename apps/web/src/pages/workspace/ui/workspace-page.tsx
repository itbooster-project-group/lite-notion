'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildProjectPageTree, normalizePageTree, selectPage } from '@/entities/page';
import {
  DeleteConfirmationDialog,
  type DeleteConfirmationIntent,
  type PageDeleteRequest,
  type ProjectDeleteRequest,
  usePageManagement,
  useProjectCreation,
  useProjectDeletion,
  useWorkspaceDeleteCleanupCoordinator,
} from '@/features/workspace-management';
import {
  type PageTreeNodeDto,
  type ProjectDto,
  useGetPageTree,
  useListProjects,
} from '@/shared/api';
import { type WorkspaceRouteContext, workspaceProjectPath } from '@/shared/routing';
import { Button, Heading, Input, Menu, MenuItem, MenuPopup, MenuTrigger, Text } from '@/shared/ui';
import { WorkspaceNavigation } from '@/widgets/workspace-navigation';

import { WorkspaceMain } from './workspace-main';

type WorkspacePageProps = Readonly<{
  route: WorkspaceRouteContext;
}>;

export type { WorkspaceRouteContext };

type WorkspaceDeleteIntent =
  | (PageDeleteRequest & Readonly<{ kind: 'page' }>)
  | (ProjectDeleteRequest & Readonly<{ kind: 'project' }>);

export function WorkspacePage({ route }: WorkspacePageProps) {
  const projectsQuery = useListProjects<ProjectDto[]>();
  const pageTreeQuery = useGetPageTree<PageTreeNodeDto[]>();
  const pageManagement = usePageManagement(route);
  const projectCreation = useProjectCreation();
  const projectDeletion = useProjectDeletion(route);
  const deleteCleanupCoordinator = useWorkspaceDeleteCleanupCoordinator();
  const deletePendingRef = useRef(false);
  const [deleteIntent, setDeleteIntent] = useState<WorkspaceDeleteIntent>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);

  useEffect(() => {
    deleteCleanupCoordinator.setRouteContext(route);
  }, [deleteCleanupCoordinator, route]);

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
        onRequestDeletePage={requestPageDelete}
        onRequestDeleteProject={requestProjectDelete}
      />

      <div className="relative min-h-0 min-w-0 overflow-y-auto">
        {route.type === 'root' ? (
          <WorkspaceRoot
            isCreating={projectCreation.isCreatingProject}
            projects={projects}
            onCreateProject={projectCreation.createProject}
            onRequestDeleteProject={requestProjectDelete}
          />
        ) : (
          <WorkspaceMain
            activePageId={activePage?.id}
            normalizedTree={normalizedTree}
            onCreatePage={createPage}
            onMovePage={pageManagement.movePage}
            onRenamePage={pageManagement.renamePage}
            onRequestDeletePage={requestPageDelete}
            projectTree={projectTree}
            projectName={project?.name ?? ''}
          />
        )}
      </div>
      <DeleteConfirmationDialog
        error={deleteError}
        intent={toDeleteConfirmationIntent(deleteIntent)}
        pending={deletePending}
        onCancel={closeDeleteDialog}
        onConfirm={() => void submitDelete()}
      />
    </div>
  );
}

function WorkspaceRoot({
  isCreating,
  onCreateProject,
  onRequestDeleteProject,
  projects,
}: Readonly<{
  isCreating: boolean;
  onCreateProject: (name: string) => Promise<void>;
  onRequestDeleteProject: (request: ProjectDeleteRequest) => void;
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
              <ProjectCard project={project} onRequestDeleteProject={onRequestDeleteProject} />
            </li>
          ))}
        </ul>
      ) : (
        <Text variant="caption">Создайте первый проект, чтобы начать работу.</Text>
      )}
    </main>
  );
}

function ProjectCard({
  onRequestDeleteProject,
  project,
}: Readonly<{
  onRequestDeleteProject: (request: ProjectDeleteRequest) => void;
  project: ProjectDto;
}>) {
  const actionsRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex min-h-16 items-start gap-2 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent">
      <Link
        className="min-w-0 flex-1 rounded-md text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        href={workspaceProjectPath(project.id)}
      >
        {project.name}
      </Link>
      <Menu modal={false}>
        <MenuTrigger
          ref={actionsRef}
          aria-label={`Действия для проекта ${project.name}`}
          render={<Button size="icon-sm" type="button" variant="ghost" />}
        >
          <MoreHorizontal aria-hidden="true" />
        </MenuTrigger>
        <MenuPopup sideOffset={4}>
          <MenuItem
            variant="destructive"
            onClick={() =>
              onRequestDeleteProject({
                name: project.name,
                projectId: project.id,
                returnFocus: actionsRef.current ?? undefined,
              })
            }
          >
            <Trash2 aria-hidden="true" />
            Удалить проект
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function toDeleteConfirmationIntent(
  intent: WorkspaceDeleteIntent | undefined,
): DeleteConfirmationIntent | undefined {
  if (!intent) return undefined;
  if (intent.kind === 'project') {
    return { kind: 'project', name: intent.name, returnFocus: intent.returnFocus };
  }

  return { kind: 'page', returnFocus: intent.returnFocus, title: intent.title };
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
