'use client';

import type { Editor } from '@tiptap/core';
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { yUndoPluginKey } from 'y-prosemirror';
import { Button } from '@/shared/ui';

import {
  canRunPageEditorCommand,
  type PageEditorCommand,
  runPageEditorCommand,
} from '../../model/editor-commands';

type EditorToolbarProps = Readonly<{
  editor: Editor;
}>;

type ToolbarAction = Readonly<{
  command: PageEditorCommand;
  icon: typeof Undo2;
  label: string;
}>;

const HISTORY_ACTIONS = [
  { command: 'undo', icon: Undo2, label: 'Отменить' },
  { command: 'redo', icon: Redo2, label: 'Повторить' },
] as const satisfies readonly ToolbarAction[];

function ToolbarButton({ action, editor }: Readonly<{ action: ToolbarAction; editor: Editor }>) {
  const Icon = action.icon;
  const disabled = !canRunPageEditorCommand(editor, action.command);

  return (
    <Button
      aria-label={action.label}
      disabled={disabled}
      onClick={() => runPageEditorCommand(editor, action.command)}
      size="icon-sm"
      title={action.label}
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((version) => version + 1);
    const undoManager = yUndoPluginKey.getState(editor.state)?.undoManager;
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    undoManager?.on('stack-item-added', refresh);
    undoManager?.on('stack-item-popped', refresh);
    undoManager?.on('stack-cleared', refresh);

    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
      undoManager?.off('stack-item-added', refresh);
      undoManager?.off('stack-item-popped', refresh);
      undoManager?.off('stack-cleared', refresh);
    };
  }, [editor]);

  const availableActions = HISTORY_ACTIONS.filter((action) =>
    canRunPageEditorCommand(editor, action.command),
  );

  if (availableActions.length === 0) return null;

  return (
    <div aria-label="История изменений" className="mb-2 flex items-center gap-1" role="toolbar">
      {availableActions.map((action) => (
        <ToolbarButton action={action} editor={editor} key={action.command} />
      ))}
    </div>
  );
}
