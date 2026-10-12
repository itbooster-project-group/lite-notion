'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  type DeletedPageTreeNodeDto,
  type ErrorType,
  getGetPageTrashQueryKey,
  getGetPageTreeQueryKey,
  getGetProjectTrashQueryKey,
  getListProjectsQueryKey,
  type HttpErrorResponseDto,
  type ProjectDto,
  type PurgeConfirmationResponseDto,
  usePurgePage,
  usePurgeProject,
  useRestorePage,
  useRestoreProject,
} from '@/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  Text,
} from '@/shared/ui';
import type { TrashOperation } from '../model/trash-operation';

type CascadeConfirmation = Readonly<{ explanation: string; titles: string[] }>;

type TrashOperationDialogProps = Readonly<{
  activeProjects: ProjectDto[];
  activeProjectsError: boolean;
  activeProjectsPending: boolean;
  onClose: () => void;
  operation: TrashOperation | undefined;
  pages: DeletedPageTreeNodeDto[] | undefined;
}>;

export function TrashOperationDialog({
  activeProjects,
  activeProjectsError,
  activeProjectsPending,
  onClose,
  operation,
  pages,
}: TrashOperationDialogProps) {
  const queryClient = useQueryClient();
  const restorePage = useRestorePage();
  const restoreProject = useRestoreProject();
  const purgePage = usePurgePage();
  const purgeProject = usePurgeProject();
  const [cascadeConfirmation, setCascadeConfirmation] = useState<CascadeConfirmation>();
  const [targetProjectId, setTargetProjectId] = useState('');
  const [error, setError] = useState<string>();

  const anyPending =
    restorePage.isPending ||
    restoreProject.isPending ||
    purgePage.isPending ||
    purgeProject.isPending;
  const item = operation?.item;
  const isRestore = operation?.type === 'restore';
  const pageRestoreNeedsTarget =
    isRestore &&
    item?.kind === 'page' &&
    !activeProjectsPending &&
    !activeProjectsError &&
    !activeProjects.some((project) => project.id === getSelectedPageProjectId(pages, item.id));
  const pageRestoreBlocked =
    isRestore && item?.kind === 'page' && (activeProjectsPending || activeProjectsError);

  async function invalidateWorkspace() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetPageTrashQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetProjectTrashQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetPageTreeQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }),
    ]);
  }

  function resetDialog() {
    setCascadeConfirmation(undefined);
    setTargetProjectId('');
    setError(undefined);
  }

  function handleOpenChange(open: boolean) {
    if (!open && !anyPending) {
      resetDialog();
      onClose();
    }
  }

  async function restoreSelected() {
    if (!item || !isRestore || anyPending || pageRestoreBlocked) return;
    setError(undefined);
    try {
      if (item.kind === 'project') {
        await restoreProject.mutateAsync({ projectId: item.id });
      } else {
        const projectId = getSelectedPageProjectId(pages, item.id);
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
          pageId: item.id,
          ...(!isProjectActive ? { data: { projectId: targetProjectId } } : {}),
        });
      }
      await invalidateWorkspace();
      resetDialog();
      onClose();
    } catch {
      setError(
        'Не удалось восстановить элемент. Возможно, он уже изменён. Обновите список и попробуйте снова.',
      );
      await invalidateWorkspace();
    }
  }

  async function purgeSelected(cascade = false) {
    if (!item || operation?.type !== 'purge' || anyPending) return;
    setError(undefined);
    try {
      if (item.kind === 'page') {
        await purgePage.mutateAsync({
          pageId: item.id,
          ...(cascade ? { params: { cascade: true } } : {}),
        });
      } else {
        await purgeProject.mutateAsync({
          projectId: item.id,
          ...(cascade ? { params: { cascade: true } } : {}),
        });
      }
      await invalidateWorkspace();
      resetDialog();
      onClose();
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
    }
  }

  const dialogTitle = cascadeConfirmation
    ? 'Удалить затрагиваемые страницы?'
    : item?.title || 'Без названия';
  const dialogDescription = getDialogDescription({
    activeProjects,
    activeProjectsError,
    activeProjectsPending,
    cascadeConfirmation,
    item,
    isRestore,
    pageRestoreNeedsTarget,
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={Boolean(operation)}>
      <DialogContent showCloseButton={!anyPending}>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
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
        ) : isRestore && pageRestoreNeedsTarget && activeProjects.length > 0 ? (
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
            onClick={() => handleOpenChange(false)}
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
          ) : isRestore ? (
            <Button
              disabled={pageRestoreBlocked || (pageRestoreNeedsTarget && !targetProjectId)}
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
  );
}

function getDialogDescription({
  activeProjects,
  activeProjectsError,
  activeProjectsPending,
  cascadeConfirmation,
  item,
  isRestore,
  pageRestoreNeedsTarget,
}: Readonly<{
  activeProjects: ProjectDto[];
  activeProjectsError: boolean;
  activeProjectsPending: boolean;
  cascadeConfirmation: CascadeConfirmation | undefined;
  item: TrashOperation['item'] | undefined;
  isRestore: boolean;
  pageRestoreNeedsTarget: boolean;
}>): string {
  if (cascadeConfirmation) return cascadeConfirmation.explanation;
  if (!isRestore) {
    return item?.kind === 'page'
      ? 'Страница и её поддерево будут удалены без возможности восстановления.'
      : 'Проект и находящиеся в нём страницы будут удалены без возможности восстановления.';
  }
  if (item?.kind === 'page' && activeProjectsPending) return 'Загружаем список активных проектов.';
  if (item?.kind === 'page' && activeProjectsError)
    return 'Не удалось загрузить активные проекты. Закройте окно и повторите загрузку.';
  if (pageRestoreNeedsTarget) {
    if (activeProjects.length === 0)
      return 'Для восстановления страницы нужен активный проект. Создайте или восстановите проект.';
    return 'Исходный проект удалён. Выберите активный проект, куда восстановить страницу.';
  }
  return 'Выберите действие для элемента корзины.';
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

function getTitlesWithKeys(titles: string[]): ReadonlyArray<{ key: string; title: string }> {
  const occurrences = new Map<string, number>();
  return titles.map((title) => {
    const occurrence = occurrences.get(title) ?? 0;
    occurrences.set(title, occurrence + 1);
    return { key: `${title}-${occurrence}`, title };
  });
}
