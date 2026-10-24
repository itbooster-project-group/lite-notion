'use client';

import { Folder, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { buildProjectPageTree, getPageCapabilities } from '@/entities/page';
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
import {
  Button,
  ContentContainer,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Heading,
  Input,
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  Text,
} from '@/shared/ui';
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
    pageAccessPending,
    pageAccessError,
    pageAccessUnavailable,
    pageTree: normalizedTree,
    projects,
    projectsError,
    projectsPending,
    pageTreeError,
    pageTreePending,
    refetchPageTree,
    refetchProjects,
    refetchPageAccess,
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

  if (route.type === 'page' && pageAccessPending) {
    return (
      <ContentContainer className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Text variant="caption">Проверяем доступ к странице…</Text>
      </ContentContainer>
    );
  }
  if (route.type === 'page' && pageAccessUnavailable) return <WorkspaceUnavailable />;
  if (route.type === 'page' && pageAccessError) {
    return <WorkspaceError onRetry={() => void refetchPageAccess()} pageLevel />;
  }

  const metadataPending = route.type !== 'page' && (projectsPending || pageTreePending);
  if (metadataPending) {
    return (
      <ContentContainer className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
        <Text variant="caption">Загружаем рабочую область…</Text>
      </ContentContainer>
    );
  }

  const workspaceMetadataError = route.type !== 'page' && (projectsError || pageTreeError);
  if (workspaceMetadataError) {
    return (
      <WorkspaceError
        pageLevel={false}
        onRetry={() => {
          void refetchPageTree();
          void refetchProjects();
        }}
      />
    );
  }

  const pageUnavailable =
    route.type === 'page' ? !activePage : route.type === 'project' && !project;
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
            pageCapabilities={activePage ? getPageCapabilities(activePage.accessRole) : undefined}
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const submittingRef = useRef(false);

  function handleCreateDialogOpenChange(open: boolean) {
    if (!open && isCreating) return;
    if (open) {
      setError(undefined);
      setProjectName('');
    }
    setCreateDialogOpen(open);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || isCreating) return;

    const name = projectName.trim();
    if (!name) {
      setError('Введите название проекта');
      return;
    }
    if (name.length > 255) {
      setError('Название может содержать до 255 символов');
      return;
    }
    setError(undefined);
    submittingRef.current = true;
    try {
      await onCreateProject(name);
      setCreateDialogOpen(false);
      setProjectName('');
    } catch {
      setError('Ошибка создания проекта. Попробуйте ещё раз.');
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <ContentContainer as="section" className="space-y-8" aria-labelledby="projects-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Heading as="h1" id="projects-title" variant="page">
          Проекты
        </Heading>
        <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
          <DialogTrigger
            render={
              <Button type="button">
                <Plus aria-hidden="true" />
                Создать проект
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md" closeLabel="Закрыть">
            <DialogHeader>
              <DialogTitle>Создать проект</DialogTitle>
              <DialogDescription>Введите название нового проекта.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" noValidate onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="project-name">
                  Название проекта
                </label>
                <Input
                  aria-describedby={error ? 'project-name-error' : undefined}
                  aria-invalid={Boolean(error)}
                  autoFocus
                  id="project-name"
                  maxLength={255}
                  name="project-name"
                  onChange={(event) => setProjectName(event.currentTarget.value)}
                  value={projectName}
                />
                {error ? (
                  <Text id="project-name-error" role="alert" variant="error">
                    {error}
                  </Text>
                ) : null}
              </div>
              <DialogFooter>
                <DialogClose
                  render={<Button disabled={isCreating} type="button" variant="outline" />}
                >
                  Отмена
                </DialogClose>
                <Button loading={isCreating} type="submit">
                  {isCreating ? 'Создаём…' : 'Создать проект'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length > 0 ? (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),19rem))] justify-start gap-3"
          aria-label="Список проектов"
        >
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onRequestDeleteProject={onRequestDeleteProject} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Text variant="caption">Создайте первый проект, чтобы начать работу.</Text>
        </div>
      )}
    </ContentContainer>
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
    <article className="flex min-h-20 min-w-0 items-start gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
      <Link
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        href={workspaceProjectPath(project.id)}
      >
        <Folder aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words font-medium leading-snug">{project.name}</span>
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
    </article>
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
    <ContentContainer as="section" className="flex min-h-[60vh] items-center justify-center">
      <section className="max-w-lg space-y-4 text-center">
        <Heading as="h1" variant="page">
          Ничего не найдено
        </Heading>
        <Text variant="caption">Перейдите к списку проектов и выберите рабочую область.</Text>
        <Button render={<Link href="/" />}>К проектам</Button>
      </section>
    </ContentContainer>
  );
}

function WorkspaceError({
  onRetry,
  pageLevel = false,
}: Readonly<{ onRetry: () => void; pageLevel?: boolean }>) {
  return (
    <ContentContainer as="section" className="flex min-h-[60vh] items-center justify-center">
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
    </ContentContainer>
  );
}
