'use client';

import type { Editor } from '@tiptap/core';
import { Bold, Code2, Italic, Link2, Strikethrough } from 'lucide-react';
import { Button } from '@/shared/ui';

import { type PageEditorCommand, runPageEditorCommand } from '../../model/editor-commands';

type BubbleFormattingMenuProps = Readonly<{
  editor: Editor;
  onOpenLinkForm(): void;
}>;

const MARK_ACTIONS = [
  { command: 'bold', icon: Bold, label: 'Полужирный' },
  { command: 'italic', icon: Italic, label: 'Курсив' },
  { command: 'strike', icon: Strikethrough, label: 'Зачёркнутый' },
  { command: 'inline-code', icon: Code2, label: 'Встроенный код' },
] as const satisfies readonly Readonly<{
  command: PageEditorCommand;
  icon: typeof Bold;
  label: string;
}>[];

export function BubbleFormattingMenu({ editor, onOpenLinkForm }: BubbleFormattingMenuProps) {
  return (
    <div
      aria-label="Контекстное форматирование"
      className="flex gap-1 rounded-lg border bg-background p-1 shadow-sm"
      role="toolbar"
    >
      {MARK_ACTIONS.map((action) => {
        const Icon = action.icon;

        return (
          <Button
            aria-label={action.label}
            key={action.command}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runPageEditorCommand(editor, action.command)}
            size="icon-sm"
            title={action.label}
            type="button"
            variant="ghost"
          >
            <Icon aria-hidden="true" />
          </Button>
        );
      })}
      <Button
        aria-label="Добавить ссылку"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onOpenLinkForm}
        size="icon-sm"
        title="Добавить ссылку"
        type="button"
        variant="ghost"
      >
        <Link2 aria-hidden="true" />
      </Button>
    </div>
  );
}
