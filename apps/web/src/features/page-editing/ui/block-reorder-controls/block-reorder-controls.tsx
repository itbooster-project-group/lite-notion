'use client';

import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui';

import {
  canMovePageDocumentBlock,
  movePageDocumentBlock,
} from '../../model/page-document-block-reorder';

export type BlockReorderControlsProps = Readonly<{ editor: Editor }>;

export function BlockReorderControls({ editor }: BlockReorderControlsProps) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((version) => version + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);

    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  return (
    <>
      <DragHandle className="page-editor-drag-handle" editor={editor} nested={false}>
        <button aria-label="Перетащить блок" type="button">
          <GripVertical aria-hidden="true" />
        </button>
      </DragHandle>
      <fieldset
        aria-label="Перемещение блока с клавиатуры"
        className="sr-only rounded-md border bg-background p-1 shadow-sm focus-within:not-sr-only focus-within:fixed focus-within:top-4 focus-within:right-4 focus-within:z-50 focus-within:flex focus-within:gap-1"
        data-keyboard-reorder-controls=""
      >
        <Button
          aria-label="Move up"
          disabled={!canMovePageDocumentBlock(editor, 'up')}
          onClick={() => movePageDocumentBlock(editor, 'up')}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          aria-label="Move down"
          disabled={!canMovePageDocumentBlock(editor, 'down')}
          onClick={() => movePageDocumentBlock(editor, 'down')}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      </fieldset>
    </>
  );
}
