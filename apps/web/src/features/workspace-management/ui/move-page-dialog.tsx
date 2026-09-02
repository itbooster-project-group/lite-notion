'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isMoveIntentValid,
  type MoveIntent,
  type NormalizedPageTree,
  type ProjectPageTree,
} from '@/entities/page';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Text,
} from '@/shared/ui';

type MovePageDialogProps = Readonly<{
  normalizedTree: NormalizedPageTree;
  onClose: () => void;
  onMove: (intent: MoveIntent) => Promise<void>;
  pageId: string | undefined;
  projectTree: ProjectPageTree;
  returnFocus: HTMLElement | undefined;
}>;

export function MovePageDialog({
  normalizedTree,
  onClose,
  onMove,
  pageId,
  projectTree,
  returnFocus,
}: MovePageDialogProps) {
  const [parentPageId, setParentPageId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (pageId) {
      setParentPageId(null);
      setIndex(0);
      setError(undefined);
    }
  }, [pageId]);

  const parentOptions = useMemo(() => {
    if (!pageId) return [];
    return Object.values(projectTree.items).filter(
      (item) =>
        !item.synthetic &&
        isMoveIntentValid(normalizedTree, {
          index: 0,
          pageId,
          parentPageId: item.id,
          projectId: projectTree.projectId,
        }),
    );
  }, [normalizedTree, pageId, projectTree]);

  const siblingIds = pageId
    ? (parentPageId
        ? (projectTree.items[parentPageId]?.childrenIds ?? [])
        : (projectTree.items[projectTree.rootItemId]?.childrenIds ?? [])
      ).filter((id) => id !== pageId)
    : [];

  async function submitMove() {
    if (!pageId || pendingRef.current) return;
    const intent = {
      index,
      pageId,
      parentPageId,
      projectId: projectTree.projectId,
    } satisfies MoveIntent;
    if (!isMoveIntentValid(normalizedTree, intent)) {
      setError('Выберите допустимое место для страницы.');
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onMove(intent);
      onClose();
    } catch {
      setError('Ошибка перемещения страницы. Попробуйте ещё раз.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(pageId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent finalFocus={() => returnFocus ?? true} showCloseButton={false}>
        <DialogTitle>Переместить страницу</DialogTitle>
        <DialogDescription>
          Выберите нового родителя и позицию среди его дочерних страниц.
        </DialogDescription>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            <span>Родитель</span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-3"
              value={parentPageId ?? ''}
              onChange={(event) => {
                setParentPageId(event.target.value || null);
                setIndex(0);
              }}
            >
              <option value="">Корень проекта</option>
              {parentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm font-medium">
            <span>Позиция</span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-3"
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              <option value={0}>В начало</option>
              {siblingIds.map((siblingId, siblingIndex) => (
                <option key={siblingId} value={siblingIndex + 1}>
                  После {projectTree.items[siblingId]?.title ?? 'страницы'}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <Text role="alert" variant="error">
              {error}
            </Text>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Отмена</DialogClose>
            <Button disabled={pending} type="button" onClick={() => void submitMove()}>
              {pending ? 'Перемещаем…' : 'Переместить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
