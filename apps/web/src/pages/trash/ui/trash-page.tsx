'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';
import {
  type DeletedPageTreeNodeDto,
  type DeletedProjectDto,
  type ErrorType,
  getGetPageTrashQueryKey,
  getGetPageTreeQueryKey,
  getGetProjectTrashQueryKey,
  getListProjectsQueryKey,
  type HttpErrorResponseDto,
  type ProjectDto,
  type PurgeConfirmationResponseDto,
  useGetPageTrash,
  useGetProjectTrash,
  useListProjects,
  usePurgePage,
  usePurgeProject,
  useRestorePage,
  useRestoreProject,
} from '@/shared/api';
import {
  Button,
  ContentContainer,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Heading,
  Select,
  Text,
} from '@/shared/ui';

type TrashTab = 'pages' | 'projects';
type SelectedItem =
  | Readonly<{ id: string; kind: 'page'; title: string }>
  | Readonly<{ id: string; kind: 'project'; title: string }>;
type CascadeConfirmation = Readonly<{ explanation: string; titles: string[] }>;
type DialogAction = 'purge' | 'restore';

export function TrashPage() {
  const queryClient = useQueryClient();
  const pagesQuery = useGetPageTrash<DeletedPageTreeNodeDto[]>();
  const projectsTrashQuery = useGetProjectTrash<DeletedProjectDto[]>();
  const projectsQuery = useListProjects<ProjectDto[]>();
  const restorePage = useRestorePage();
  const restoreProject = useRestoreProject();
  const purgePage = usePurgePage();
  const purgeProject = usePurgeProject();
  const [tab, setTab] = useState<TrashTab>('pages');
  const [selected, setSelected] = useState<SelectedItem>();
  const [dialogAction, setDialogAction] = useState<DialogAction>('restore');
  const [cascadeConfirmation, setCascadeConfirmation] = useState<CascadeConfirmation>();
  const [targetProjectId, setTargetProjectId] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const activeProjects = projectsQuery.data ?? [];
  const projectNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const project of [...(projectsTrashQuery.data ?? []), ...activeProjects]) {
      names.set(project.id, project.name);
    }
    return names;
  }, [activeProjects, projectsTrashQuery.data]);

  const pageRestoreNeedsTarget =
    selected?.kind === 'page' &&
    !activeProjects.some(
      (project) => project.id === getSelectedPageProjectId(pagesQuery.data, selected.id),
    );
  const anyPending =
    busy ||
    restorePage.isPending ||
    restoreProject.isPending ||
    purgePage.isPending ||
    purgeProject.isPending;

  async function invalidateWorkspace() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPageTrashQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetProjectTrashQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetPageTreeQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
    ]);
  }

  function closeDialog(open: boolean) {
    if (!open && !anyPending) {
      setSelected(undefined);
      setDialogAction('restore');
      setCascadeConfirmation(undefined);
      setError(undefined);
      setTargetProjectId('');
    }
  }

  async function restoreSelected() {
    if (!selected || anyPending) return;
    setBusy(true);
    setError(undefined);
    try {
      if (selected.kind === 'project') {
        await restoreProject.mutateAsync({ projectId: selected.id });
      } else {
        const projectId = getSelectedPageProjectId(pagesQuery.data, selected.id);
        const isProjectActive = activeProjects.some((project) => project.id === projectId);
        if (!isProjectActive && !targetProjectId) {
          setError(
            activeProjects.length === 0
              ? 'Сначала создайте или восстановите проект, затем восстановите страницу.'
              : 'Выберите активный проект для восстановления страницы.',
          );
          return;
        }
        await restorePage.mutateAsync({
          pageId: selected.id,
          ...(!isProjectActive ? { data: { projectId: targetProjectId } } : {}),
        });
      }
      await invalidateWorkspace();
      finishDialog();
    } catch {
      setError(
        'Не удалось восстановить элемент. Возможно, он уже изменён. Обновите список и попробуйте снова.',
      );
      await invalidateWorkspace();
    } finally {
      setBusy(false);
    }
  }

  async function purgeSelected(cascade = false) {
    if (!selected || anyPending) return;
    setBusy(true);
    setError(undefined);
    try {
      if (selected.kind === 'page') {
        await purgePage.mutateAsync({
          pageId: selected.id,
          ...(cascade ? { params: { cascade: true } } : {}),
        });
      } else {
        await purgeProject.mutateAsync({
          projectId: selected.id,
          ...(cascade ? { params: { cascade: true } } : {}),
        });
      }
      await invalidateWorkspace();
      finishDialog();
    } catch (caught) {
      const confirmation = parseCascadeConfirmation(caught);
      if (!cascade && confirmation) {
        setCascadeConfirmation(confirmation);
        return;
      }
      setError(
        'Не удалось удалить элемент. Возможно, он уже изменён. Обновите список и попробуйте снова.',
      );
      await invalidateWorkspace();
    } finally {
      setBusy(false);
    }
  }

  const pageListLoading =
    pagesQuery.isPending || projectsQuery.isPending || projectsTrashQuery.isPending;
  const projectListLoading = projectsTrashQuery.isPending;
  const pageListError = pagesQuery.isError || projectsQuery.isError || projectsTrashQuery.isError;
  const projectListError = projectsTrashQuery.isError;

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
            {pageListLoading ? <Text aria-busy="true">Загружаем страницы корзины…</Text> : null}
            {pageListError ? (
              <RetryState
                label="Не удалось загрузить страницы корзины."
                onRetry={() =>
                  void Promise.all([
                    pagesQuery.refetch(),
                    projectsQuery.refetch(),
                    projectsTrashQuery.refetch(),
                  ])
                }
              />
            ) : null}
            {!pageListLoading && !pageListError && (pagesQuery.data?.length ?? 0) === 0 ? (
              <Text>В корзине нет страниц.</Text>
            ) : null}
            {!pageListLoading && !pageListError && pagesQuery.data?.length ? (
              <ul aria-label="Удалённые страницы" className="space-y-3">
                {pagesQuery.data.map((node) => (
                  <DeletedPageRow
                    key={node.id}
                    node={node}
                    projectName={projectNames.get(node.projectId) ?? 'Исходный проект недоступен'}
                    onRestore={(item) => openRestore(item)}
                    onPurge={(item) => openPurge(item)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div aria-labelledby="trash-projects-tab" id="trash-projects-panel" role="tabpanel">
            {projectListLoading ? <Text aria-busy="true">Загружаем проекты корзины…</Text> : null}
            {projectListError ? (
              <RetryState
                label="Не удалось загрузить проекты корзины."
                onRetry={() => void projectsTrashQuery.refetch()}
              />
            ) : null}
            {!projectListLoading &&
            !projectListError &&
            (projectsTrashQuery.data?.length ?? 0) === 0 ? (
              <Text>В корзине нет проектов.</Text>
            ) : null}
            {!projectListLoading && !projectListError && projectsTrashQuery.data?.length ? (
              <ul aria-label="Удалённые проекты" className="space-y-3">
                {projectsTrashQuery.data.map((project) => (
                  <li className="rounded-lg border p-4" key={project.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <Text className="break-words">{project.name || 'Без названия'}</Text>
                        <Text variant="caption">Удалён: {formatDate(project.deletedAt)}</Text>
                      </div>
                      <RowActions
                        name={project.name}
                        onRestore={() =>
                          openRestore({ id: project.id, kind: 'project', title: project.name })
                        }
                        onPurge={() =>
                          openPurge({ id: project.id, kind: 'project', title: project.name })
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>

      <Dialog onOpenChange={closeDialog} open={Boolean(selected)}>
        <DialogContent showCloseButton={!anyPending}>
          <DialogHeader>
            <DialogTitle>
              {cascadeConfirmation
                ? 'Удалить затрагиваемые страницы?'
                : selected?.kind === 'page'
                  ? selected.title || 'Без названия'
                  : selected?.title || 'Без названия'}
            </DialogTitle>
            <DialogDescription>
              {cascadeConfirmation
                ? cascadeConfirmation.explanation
                : dialogAction === 'purge'
                  ? selected?.kind === 'page'
                    ? 'Страница и её поддерево будут удалены без возможности восстановления.'
                    : 'Проект и находящиеся в нём страницы будут удалены без возможности восстановления.'
                  : pageRestoreNeedsTarget
                    ? activeProjects.length === 0
                      ? 'Для восстановления страницы нужен активный проект. Создайте или восстановите проект.'
                      : 'Исходный проект удалён. Выберите активный проект, куда восстановить страницу.'
                    : 'Выберите действие для элемента корзины.'}
            </DialogDescription>
          </DialogHeader>
          {cascadeConfirmation ? (
            <ul
              aria-label="Удаляемые страницы"
              className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5"
            >
              {getTitlesWithKeys(cascadeConfirmation.titles).map(({ key, title }) => (
                <li className="break-words" key={key}>
                  {title || 'Без названия'}
                </li>
              ))}
            </ul>
          ) : dialogAction === 'restore' && pageRestoreNeedsTarget && activeProjects.length > 0 ? (
            <Select
              aria-label="Целевой проект"
              onValueChange={(value) => setTargetProjectId(value ?? '')}
              options={activeProjects.map((project) => ({
                label: project.name,
                value: project.id,
              }))}
              value={targetProjectId}
            />
          ) : null}
          {error ? (
            <Text role="alert" variant="error">
              {error}
            </Text>
          ) : null}
          <DialogFooter>
            <Button
              disabled={anyPending}
              onClick={() => closeDialog(false)}
              type="button"
              variant="outline"
            >
              Отмена
            </Button>
            {cascadeConfirmation ? (
              <Button
                loading={anyPending}
                onClick={() => void purgeSelected(true)}
                type="button"
                variant="destructive"
              >
                Удалить каскадно
              </Button>
            ) : dialogAction === 'restore' ? (
              <Button
                disabled={pageRestoreNeedsTarget && !targetProjectId}
                loading={anyPending}
                onClick={() => void restoreSelected()}
                type="button"
              >
                Восстановить
              </Button>
            ) : (
              <Button
                loading={anyPending}
                onClick={() => void purgeSelected()}
                type="button"
                variant="destructive"
              >
                Удалить навсегда
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentContainer>
  );

  function openRestore(item: SelectedItem) {
    setError(undefined);
    setCascadeConfirmation(undefined);
    setDialogAction('restore');
    setSelected(item);
  }

  function openPurge(item: SelectedItem) {
    setError(undefined);
    setCascadeConfirmation(undefined);
    setDialogAction('purge');
    setSelected(item);
  }

  function finishDialog() {
    setSelected(undefined);
    setDialogAction('restore');
    setCascadeConfirmation(undefined);
    setError(undefined);
    setTargetProjectId('');
  }
}

function DeletedPageRow({
  node,
  onPurge,
  onRestore,
  projectName,
}: Readonly<{
  node: DeletedPageTreeNodeDto;
  onPurge: (item: SelectedItem) => void;
  onRestore: (item: SelectedItem) => void;
  projectName: string;
}>) {
  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <Text className="break-words">{node.title || 'Без названия'}</Text>
          <Text variant="caption">Удалён: {formatDate(node.deletedAt)}</Text>
          <Text variant="caption">Проект: {projectName}</Text>
        </div>
        <RowActions
          name={node.title}
          onRestore={() => onRestore({ id: node.id, kind: 'page', title: node.title })}
          onPurge={() => onPurge({ id: node.id, kind: 'page', title: node.title })}
        />
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
              onPurge={onPurge}
              onRestore={onRestore}
              projectName={projectName}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RowActions({
  name,
  onPurge,
  onRestore,
}: Readonly<{ name: string; onPurge: () => void; onRestore: () => void }>) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        aria-label={`Восстановить: ${name || 'Без названия'}`}
        onClick={onRestore}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <RotateCcw aria-hidden="true" />
      </Button>
      <Button
        aria-label={`Удалить навсегда: ${name || 'Без названия'}`}
        onClick={onPurge}
        size="icon-sm"
        type="button"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
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

function parseCascadeConfirmation(error: unknown): CascadeConfirmation | undefined {
  const candidate = error as ErrorType<HttpErrorResponseDto | PurgeConfirmationResponseDto>;
  const info: unknown = candidate?.info;
  const message =
    typeof info === 'object' && info !== null && 'message' in info ? info.message : undefined;
  if (
    candidate?.status !== 409 ||
    !Array.isArray(message) ||
    message.length < 2 ||
    typeof message[0] !== 'string' ||
    message[0].trim().length === 0 ||
    !message.slice(1).every((title) => typeof title === 'string')
  )
    return undefined;
  return { explanation: message[0], titles: message.slice(1) };
}

function getSelectedPageProjectId(
  nodes: DeletedPageTreeNodeDto[] | undefined,
  id: string,
): string | undefined {
  for (const node of nodes ?? []) {
    if (node.id === id) return node.projectId;
    const childProjectId = getSelectedPageProjectId(node.children, id);
    if (childProjectId) return childProjectId;
  }
  return undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function getTitlesWithKeys(titles: string[]): ReadonlyArray<{ key: string; title: string }> {
  const occurrences = new Map<string, number>();
  return titles.map((title) => {
    const occurrence = occurrences.get(title) ?? 0;
    occurrences.set(title, occurrence + 1);
    return { key: `${title}-${occurrence}`, title };
  });
}
