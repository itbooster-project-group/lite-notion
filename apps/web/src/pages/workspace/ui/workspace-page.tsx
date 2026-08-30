'use client';

import { Cancel01Icon, SidebarLeftIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ComponentProps, type FormEvent, useMemo, useState } from 'react';
import {
  type CreatePageDto,
  type CreateProjectDto,
  getGetPageTreeQueryKey,
  getListProjectsQueryKey,
  type PageTreeNodeDto,
  type ProjectDto,
  useCreatePage,
  useCreateProject,
  useGetPageTree,
  useListProjects,
  useMovePage,
  useRenamePage,
} from '@/shared/api';
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
  Heading,
  Input,
  Text,
} from '@/shared/ui';
import {
  buildProjectTree,
  insertPageIntoTree,
  type MoveIntent,
  mapMoveIntentToDto,
  movePageInTree,
  normalizePageTree,
  renamePageInTree,
  selectPage,
} from '../model/page-tree';

import { WorkspaceMain } from './workspace-main';
import { WorkspaceSidebar } from './workspace-sidebar';

export type WorkspaceRouteContext =
  | Readonly<{ type: 'root' }>
  | Readonly<{ projectId: string; type: 'project' }>
  | Readonly<{ pageId: string; type: 'page' }>;

type WorkspacePageProps = Readonly<{
  route: WorkspaceRouteContext;
}>;

export function WorkspacePage({ route }: WorkspacePageProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectsQuery = useListProjects<ProjectDto[]>();
  const pageTreeQuery = useGetPageTree<PageTreeNodeDto[]>();
  const createPageMutation = useCreatePage();
  const createProjectMutation = useCreateProject();
  const renamePageMutation = useRenamePage();
  const movePageMutation = useMovePage();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const pageTree = pageTreeQuery.data ?? [];
  const normalizedTree = useMemo(() => normalizePageTree(pageTree), [pageTree]);
  const activePage = route.type === 'page' ? selectPage(normalizedTree, route.pageId) : undefined;
  const projectId = route.type === 'project' ? route.projectId : activePage?.projectId;
  const projects = projectsQuery.data ?? [];
  const project = projectId ? projects.find((item) => item.id === projectId) : undefined;
  const projectTree = useMemo(
    () => buildProjectTree(normalizedTree, projectId ?? 'unavailable'),
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

  const sidebarProps = {
    activePageId: activePage?.id,
    normalizedTree,
    onCreatePage: createPageForProject,
    onMovePage: movePage,
    onRenamePage: renamePage,
    onSelectPage: selectPageRoute,
    onSelectProject: selectProjectRoute,
    projects,
  } satisfies ComponentProps<typeof WorkspaceSidebar>;

  async function createPageForProject(
    targetProjectId: string,
    parentPageId: string | null,
    title: string,
  ) {
    if (createPageMutation.isPending) throw new Error('Create unavailable');
    const payload = { parentPageId, projectId: targetProjectId, title } satisfies CreatePageDto;
    const page = await createPageMutation.mutateAsync({ data: payload });
    queryClient.setQueryData<PageTreeNodeDto[]>(getGetPageTreeQueryKey(), (current) =>
      insertPageIntoTree(current ?? [], page),
    );
    router.push(`/pages/${page.id}`);
  }

  async function createProject(name: string) {
    if (createProjectMutation.isPending) throw new Error('Create unavailable');
    const project = await createProjectMutation.mutateAsync({
      data: { name } satisfies CreateProjectDto,
    });
    queryClient.setQueryData<ProjectDto[]>(getListProjectsQueryKey(), (current) => [
      ...(current ?? []),
      project,
    ]);
    router.push(`/projects/${project.id}`);
  }

  async function createPage(parentPageId: string | null, title: string) {
    if (!projectId) throw new Error('Create unavailable');
    await createPageForProject(projectId, parentPageId, title);
  }

  async function renamePage(pageId: string, title: string) {
    if (renamePageMutation.isPending) throw new Error('Rename pending');
    const queryKey = getGetPageTreeQueryKey();
    await queryClient.cancelQueries({ queryKey });
    const snapshot = queryClient.getQueryData<PageTreeNodeDto[]>(queryKey);
    queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
      renamePageInTree(current ?? [], pageId, title),
    );

    try {
      await renamePageMutation.mutateAsync({ data: { title }, pageId });
    } catch (error) {
      queryClient.setQueryData(queryKey, snapshot);
      throw error;
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  async function movePage(intent: MoveIntent) {
    if (movePageMutation.isPending) throw new Error('Move pending');
    const payload = mapMoveIntentToDto(normalizedTree, intent);
    if (!payload) throw new Error('Invalid move');

    const queryKey = getGetPageTreeQueryKey();
    await queryClient.cancelQueries({ queryKey });
    const snapshot = queryClient.getQueryData<PageTreeNodeDto[]>(queryKey);
    queryClient.setQueryData<PageTreeNodeDto[]>(queryKey, (current) =>
      movePageInTree(current ?? [], intent),
    );

    try {
      await movePageMutation.mutateAsync({ data: payload, pageId: intent.pageId });
    } catch (error) {
      queryClient.setQueryData(queryKey, snapshot);
      throw error;
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  function selectProjectRoute(nextProjectId: string) {
    setMobileNavigationOpen(false);
    router.push(`/projects/${nextProjectId}`);
  }

  function selectPageRoute(pageId: string) {
    setMobileNavigationOpen(false);
    router.push(`/pages/${pageId}`);
  }

  return (
    <div className="min-h-[calc(100vh-73px)] md:grid md:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-card p-5 md:block" aria-label="Навигация по проекту">
        <WorkspaceSidebar {...sidebarProps} />
      </aside>

      <div className="relative min-w-0">
        <div className="absolute top-3 right-3 z-10 md:hidden">
          <Drawer open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
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
              <div className="overflow-y-auto px-5 pb-5">
                <WorkspaceSidebar {...sidebarProps} />
              </div>
            </DrawerContent>
          </Drawer>
        </div>

        {route.type === 'root' ? (
          <WorkspaceRoot
            isCreating={createProjectMutation.isPending}
            projects={projects}
            onCreateProject={createProject}
            onSelectProject={selectProjectRoute}
          />
        ) : (
          <WorkspaceMain
            activePageId={activePage?.id}
            normalizedTree={normalizedTree}
            onCreatePage={createPage}
            onMovePage={movePage}
            onRenamePage={renamePage}
            onSelectPage={selectPageRoute}
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
  onSelectProject,
  projects,
}: Readonly<{
  isCreating: boolean;
  onCreateProject: (name: string) => Promise<void>;
  onSelectProject: (projectId: string) => void;
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
              <button
                className="block w-full rounded-xl border bg-card p-5 text-left font-medium shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                type="button"
                onClick={() => onSelectProject(project.id)}
              >
                {project.name}
              </button>
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
