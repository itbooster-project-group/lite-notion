'use client';

import { useEffect, useRef } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Text,
} from '@/shared/ui';

export type DeleteConfirmationIntent =
  | Readonly<{
      kind: 'page';
      returnFocus: HTMLElement | undefined;
      title: string;
    }>
  | Readonly<{
      kind: 'project';
      name: string;
      returnFocus: HTMLElement | undefined;
    }>;

type DeleteConfirmationDialogProps = Readonly<{
  error: string | undefined;
  intent: DeleteConfirmationIntent | undefined;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function DeleteConfirmationDialog({
  error,
  intent,
  pending,
  onCancel,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const returnFocusRef = useRef<HTMLElement | undefined>(undefined);

  useEffect(() => {
    if (intent) {
      returnFocusRef.current = intent.returnFocus;
    }
  }, [intent]);

  return (
    <Dialog
      open={Boolean(intent)}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent finalFocus={() => returnFocusRef.current ?? true} showCloseButton={false}>
        <DialogTitle>
          {intent?.kind === 'project' ? 'Удалить проект?' : 'Удалить страницу?'}
        </DialogTitle>
        <DialogDescription>{getDescription(intent)}</DialogDescription>

        {error ? (
          <Text role="alert" variant="error">
            {error}
          </Text>
        ) : null}

        <div className="flex justify-end gap-2">
          <DialogClose render={<Button disabled={pending} type="button" variant="outline" />}>
            Отмена
          </DialogClose>
          <Button disabled={pending} type="button" variant="destructive" onClick={onConfirm}>
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getDescription(intent: DeleteConfirmationIntent | undefined): string {
  if (!intent) return '';
  if (intent.kind === 'project') {
    return `Проект «${intent.name}» и все его страницы будут перемещены в корзину.`;
  }

  return `Страница «${intent.title}» и все вложенные страницы будут перемещены в корзину.`;
}
