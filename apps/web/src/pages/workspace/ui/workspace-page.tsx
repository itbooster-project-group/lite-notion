'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { buildProjectPageTree } from '@/entities/page';
import {
  DeleteConfirmationDialog,
  type DeleteConfirmationIntent,
  type PageDeleteRequest,
  type ProjectDeleteRequest,
  usePageManagement,
  useProjectCreation,
  useProjectDeletion,
} from '@/features/workspace-management';
import type { ProjectDto } from '@/shared/api';
import { type WorkspaceRouteContext, workspaceProjectPath } from '@/shared/routing';
import { Button, Heading, Input, Menu, MenuItem, MenuPopup, MenuTrigger, Text } from '@/shared/ui';
import { useWorkspaceData } from '../model/workspace-data-context';
import { WorkspaceMain } from './workspace-main';

type WorkspacePageProps = Readonly<{
  route: WorkspaceRouteContext;
}>;

export type { WorkspaceRouteContext };

type WorkspaceDeleteIntent =
  | (PageDeleteRequest & Readonly<{ kind: 'page' }>)
  | (ProjectDeleteRequest & Readonly<{ kind: 'project' }>);

export function WorkspacePage({ route }: WorkspacePageProps) {
  const {
    pageContext,
    pageTree: normalizedTree,
    projects,
    projectsError,
    projectsPending,
    pageTreeError,
    pageTreePending,
    refetchPageTree,
    refetchProjects,
    refetchSharedPages,
    sharedPagesError,
    sharedPagesPending,
  } = useWorkspaceData();
  const pageManagement = usePageManagement(route);
  const projectCreation = useProjectCreation();
  const projectDeletion = useProjectDeletion(route);
  const deletePendingRef = useRef(false);
  const [deleteIntent, setDeleteIntent] = useState<WorkspaceDeleteIntent>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);

  const activePage = pageContext?.page;
  const effectiveProjectId =
    route.type === 'project'
      ? route.projectId
      : pageContext?.source === 'owned'
        ? activePage?.projectId
        : undefined;
  const project = projects.find((item) => item.id === effectiveProjectId);
  const projectTree = useMemo(
    () => buildProjectPageTree(normalizedTree, effectiveProjectId ?? 'unavailable'),
    [effectiveProjectId, normalizedTree],
  );

  const metadataPending = route.type !== 'page' && (projectsPending || pageTreePending);
  const routePending =
    pageTreePending ||
    (route.type === 'page' && pageContext?.source === 'owned' && projectsPending) ||
    (route.type === 'page' && pageContext?.source !== 'owned' && sharedPagesPending);
  if (metadataPending || routePending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Text variant="caption">Загружаем рабочую область…</Text>
      </div>
    );
  }

  const pageRouteError =
    route.type === 'page' && pageContext?.source !== 'owned' && sharedPagesError;
  const ownedProjectsError =
    projectsError && (route.type !== 'page' || pageContext?.source === 'owned');
  if (ownedProjectsError || pageTreeError || pageRouteError) {
    return (
      <WorkspaceError
        pageLevel={Boolean(pageRouteError)}
        onRetry={() => {
          void refetchPageTree();
          if (route.type !== 'page' || pageContext?.source === 'owned') void refetchProjects();
          if (route.type === 'page' && pageContext?.source !== 'owned') void refetchSharedPages();
        }}
      />
    );
  }

  const pageUnavailable = !activePage || (pageContext?.source === 'owned' && !project);
  if (route.type !== 'root' && (route.type === 'project' ? !project : pageUnavailable)) {
    return <WorkspaceUnavailable />;
  }

  async function createPage(parentPageId: string | null, title: string) {
    if (!effectiveProjectId) throw new Error('Create unavailable');
    await pageManagement.createPage(effectiveProjectId, parentPageId, title);
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
    <div className="relative min-h-0">
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
            activePage={activePage}
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
    <section
      className="mx-auto w-full max-w-shell space-y-8 px-page-inline py-page-block"
      aria-labelledby="projects-title"
    >
      <div className="space-y-3">
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
      </div>

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
    </section>
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
    <section className="flex min-h-[60vh] items-center justify-center px-page-inline">
      <section className="max-w-lg space-y-4 text-center">
        <Heading as="h1" variant="page">
          Ничего не найдено
        </Heading>
        <Text variant="caption">Перейдите к списку проектов и выберите рабочую область.</Text>
        <Button render={<Link href="/" />}>К проектам</Button>
      </section>
    </section>
  );
}

function WorkspaceError({
  onRetry,
  pageLevel = false,
}: Readonly<{ onRetry: () => void; pageLevel?: boolean }>) {
  return (
    <section className="flex min-h-[60vh] items-center justify-center px-page-inline">
      <section className="max-w-lg space-y-4 text-center">
        <Heading as="h1" variant="page">
          {pageLevel ? 'Ошибка загрузки страницы' : 'Ошибка загрузки рабочей области'}
        </Heading>
        <Text variant="caption">
          {pageLevel
            ? 'Не удалось определить доступ к странице. Попробуйте ещё раз.'
            : 'Проверьте соединение и попробуйте ещё раз.'}
        </Text>
        <Button type="button" onClick={onRetry}>
          Повторить
        </Button>
      </section>
    </section>
  );
}
