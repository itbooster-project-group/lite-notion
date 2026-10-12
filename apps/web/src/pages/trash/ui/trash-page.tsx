'use client';

import { type KeyboardEvent, useMemo, useState } from 'react';
import {
  type TrashItem,
  TrashItemActions,
  type TrashOperation,
  TrashOperationDialog,
} from '@/features/trash-management';
import {
  type DeletedPageTreeNodeDto,
  type DeletedProjectDto,
  type ProjectDto,
  useGetPageTrash,
  useGetProjectTrash,
  useListProjects,
} from '@/shared/api';
import { Button, ContentContainer, Heading, Text } from '@/shared/ui';

type TrashTab = 'pages' | 'projects';

export function TrashPage() {
  const pagesQuery = useGetPageTrash<DeletedPageTreeNodeDto[]>();
  const projectsTrashQuery = useGetProjectTrash<DeletedProjectDto[]>();
  const projectsQuery = useListProjects<ProjectDto[]>();
  const [tab, setTab] = useState<TrashTab>('pages');
  const [operation, setOperation] = useState<TrashOperation>();

  const activeProjects = projectsQuery.data ?? [];
  const projectNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of [...(projectsTrashQuery.data ?? []), ...activeProjects]) {
      names.set(project.id, project.name);
    }
    return names;
  }, [activeProjects, projectsTrashQuery.data]);

  const projectNamesError = projectsQuery.isError || projectsTrashQuery.isError;

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: TrashTab) {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    )
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'pages'
        : event.key === 'End'
          ? 'projects'
          : current === 'pages'
            ? 'projects'
            : 'pages';
    setTab(next);
    document.getElementById(`trash-${next}-tab`)?.focus();
  }

  return (
    <ContentContainer>
      <section aria-labelledby="trash-title" className="space-y-6">
        <Heading as="h1" id="trash-title" variant="page">
          Корзина
        </Heading>
        <div
          aria-label="Разделы корзины"
          aria-orientation="horizontal"
          className="flex gap-2"
          role="tablist"
        >
          <button
            aria-controls="trash-pages-panel"
            aria-selected={tab === 'pages'}
            className="rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-selected:bg-accent aria-selected:text-accent-foreground"
            id="trash-pages-tab"
            onKeyDown={(event) => handleTabKeyDown(event, 'pages')}
            onClick={() => setTab('pages')}
            role="tab"
            tabIndex={tab === 'pages' ? 0 : -1}
            type="button"
          >
            Страницы
          </button>
          <button
            aria-controls="trash-projects-panel"
            aria-selected={tab === 'projects'}
            className="rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring aria-selected:bg-accent aria-selected:text-accent-foreground"
            id="trash-projects-tab"
            onKeyDown={(event) => handleTabKeyDown(event, 'projects')}
            onClick={() => setTab('projects')}
            role="tab"
            tabIndex={tab === 'projects' ? 0 : -1}
            type="button"
          >
            Проекты
          </button>
        </div>

        {tab === 'pages' ? (
          <div aria-labelledby="trash-pages-tab" id="trash-pages-panel" role="tabpanel">
            {pagesQuery.isPending ? (
              <Text aria-busy="true">Загружаем страницы корзины…</Text>
            ) : null}
            {pagesQuery.isError ? (
              <RetryState
                label="Не удалось загрузить страницы корзины."
                onRetry={() => void pagesQuery.refetch()}
              />
            ) : null}
            {!pagesQuery.isPending && !pagesQuery.isError && projectNamesError ? (
              <RetryState
                label="Не удалось загрузить названия проектов. Страницы показаны с безопасным названием проекта."
                onRetry={() =>
                  void Promise.all([projectsQuery.refetch(), projectsTrashQuery.refetch()])
                }
              />
            ) : null}
            {!pagesQuery.isPending &&
            !pagesQuery.isError &&
            (pagesQuery.data?.length ?? 0) === 0 ? (
              <Text>В корзине нет страниц.</Text>
            ) : null}
            {!pagesQuery.isPending && !pagesQuery.isError && pagesQuery.data?.length ? (
              <ul aria-label="Удалённые страницы" className="space-y-3">
                {pagesQuery.data.map((node) => (
                  <DeletedPageRow
                    key={node.id}
                    node={node}
                    onAction={setOperation}
                    projectName={projectNames.get(node.projectId) ?? 'Исходный проект недоступен'}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div aria-labelledby="trash-projects-tab" id="trash-projects-panel" role="tabpanel">
            {projectsTrashQuery.isPending ? (
              <Text aria-busy="true">Загружаем проекты корзины…</Text>
            ) : null}
            {projectsTrashQuery.isError ? (
              <RetryState
                label="Не удалось загрузить проекты корзины."
                onRetry={() => void projectsTrashQuery.refetch()}
              />
            ) : null}
            {!projectsTrashQuery.isPending &&
            !projectsTrashQuery.isError &&
            (projectsTrashQuery.data?.length ?? 0) === 0 ? (
              <Text>В корзине нет проектов.</Text>
            ) : null}
            {!projectsTrashQuery.isPending &&
            !projectsTrashQuery.isError &&
            projectsTrashQuery.data?.length ? (
              <ul aria-label="Удалённые проекты" className="space-y-3">
                {projectsTrashQuery.data.map((project) => (
                  <li className="rounded-lg border p-4" key={project.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <Text className="break-words">{project.name || 'Без названия'}</Text>
                        <Text variant="caption">Удалён: {formatDate(project.deletedAt)}</Text>
                      </div>
                      <TrashItemActions
                        item={{ id: project.id, kind: 'project', title: project.name }}
                        onAction={setOperation}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      <TrashOperationDialog
        activeProjects={activeProjects}
        activeProjectsError={projectsQuery.isError}
        activeProjectsPending={projectsQuery.isPending}
        onClose={() => setOperation(undefined)}
        operation={operation}
        pages={pagesQuery.data}
      />
    </ContentContainer>
  );
}

function DeletedPageRow({
  node,
  onAction,
  projectName,
}: Readonly<{
  node: DeletedPageTreeNodeDto;
  onAction: (operation: TrashOperation) => void;
  projectName: string;
}>) {
  const item: TrashItem = { id: node.id, kind: 'page', title: node.title };

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Text className="break-words">{node.title || 'Без названия'}</Text>
          <Text variant="caption">Удалён: {formatDate(node.deletedAt)}</Text>
          <Text variant="caption">Проект: {projectName}</Text>
        </div>
        <TrashItemActions item={item} onAction={onAction} />
      </div>
      {node.children.length > 0 ? (
        <ul
          aria-label={`Вложенные страницы: ${node.title || 'Без названия'}`}
          className="mt-3 space-y-3 border-l pl-4"
        >
          {node.children.map((child) => (
            <DeletedPageRow
              key={child.id}
              node={child}
              onAction={onAction}
              projectName={projectName}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RetryState({ label, onRetry }: Readonly<{ label: string; onRetry: () => void }>) {
  return (
    <div className="space-y-2">
      <Text role="alert">{label}</Text>
      <Button onClick={onRetry} type="button" variant="outline">
        Повторить
      </Button>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
