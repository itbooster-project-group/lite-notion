import type { Editor } from '@tiptap/core';

import { type PageEditorCommand, runPageEditorCommand } from './editor-commands';

export type PageEditorSlashCommand = Readonly<{
  command?: PageEditorCommand;
  id: string;
  label: string;
  opensLinkForm?: true;
  mediaType?: 'image' | 'video' | 'youtube';
}>;

export const PAGE_EDITOR_SLASH_COMMANDS = [
  { command: 'paragraph', id: 'paragraph', label: 'Обычный текст' },
  { command: 'heading-1', id: 'heading-1', label: 'Заголовок 1' },
  { command: 'heading-2', id: 'heading-2', label: 'Заголовок 2' },
  { command: 'heading-3', id: 'heading-3', label: 'Заголовок 3' },
  { command: 'bullet-list', id: 'bullet-list', label: 'Маркированный список' },
  { command: 'ordered-list', id: 'ordered-list', label: 'Нумерованный список' },
  { command: 'task-list', id: 'task-list', label: 'Список задач' },
  { id: 'link', label: 'Ссылка', opensLinkForm: true },
  { id: 'image', label: 'Изображение', mediaType: 'image' },
  { id: 'youtube', label: 'YouTube видео', mediaType: 'youtube' },
  { id: 'video', label: 'Видео', mediaType: 'video' },
] as const satisfies readonly PageEditorSlashCommand[];

export type PageEditorSlashQuery = Readonly<{
  from: number;
  query: string;
  to: number;
}>;

export function getPageEditorSlashQuery(editor: Editor): PageEditorSlashQuery | undefined {
  const { $from, empty, from } = editor.state.selection;
  if (!empty) return undefined;

  const textBeforeCursor = $from.parent.textBetween(0, $from.parentOffset, '', '');
  const match = /(?:^|\s)\/([^\s]*)$/.exec(textBeforeCursor);
  if (!match) return undefined;

  const prefixLength = match[0].startsWith(' ') ? 1 : 0;
  return {
    from: from - match[0].length + prefixLength,
    query: (match[1] ?? '').toLocaleLowerCase(),
    to: from,
  };
}

export function filterPageEditorSlashCommands(query: string): PageEditorSlashCommand[] {
  return PAGE_EDITOR_SLASH_COMMANDS.filter((command) =>
    command.label.toLocaleLowerCase().includes(query),
  );
}

export function runPageEditorSlashCommand(
  editor: Editor,
  query: PageEditorSlashQuery,
  command: PageEditorCommand | undefined,
): boolean {
  if (!command) return false;
  const deleted = editor.chain().focus().deleteRange(query).run();
  return deleted && runPageEditorCommand(editor, command);
}
