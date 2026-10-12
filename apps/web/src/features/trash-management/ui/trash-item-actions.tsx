'use client';

import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui';
import type { TrashItem, TrashOperation } from '../model/trash-operation';

type TrashItemActionsProps = Readonly<{
  item: TrashItem;
  onAction: (operation: TrashOperation) => void;
}>;

export function TrashItemActions({ item, onAction }: TrashItemActionsProps) {
  const name = item.title || 'Без названия';

  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        aria-label={`Восстановить: ${name}`}
        onClick={() => onAction({ item, type: 'restore' })}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <RotateCcw aria-hidden="true" />
      </Button>
      <Button
        aria-label={`Удалить навсегда: ${name}`}
        onClick={() => onAction({ item, type: 'purge' })}
        size="icon-sm"
        type="button"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
