import type { Editor } from '@tiptap/core';

export const PAGE_EDITOR_COMMANDS = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'bullet-list',
  'ordered-list',
  'task-list',
  'bold',
  'italic',
  'strike',
  'inline-code',
  'undo',
  'redo',
] as const;

export type PageEditorCommand = (typeof PAGE_EDITOR_COMMANDS)[number];

export function canRunPageEditorCommand(editor: Editor, command: PageEditorCommand): boolean {
  const chain = editor.can().chain().focus();

  switch (command) {
    case 'paragraph':
      return chain.setParagraph().run();
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return chain.toggleHeading({ level: Number(command.at(-1)) as 1 | 2 | 3 }).run();
    case 'bullet-list':
      return chain.toggleBulletList().run();
    case 'ordered-list':
      return chain.toggleOrderedList().run();
    case 'task-list':
      return chain.toggleTaskList().run();
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'strike':
      return chain.toggleStrike().run();
    case 'inline-code':
      return chain.toggleCode().run();
    case 'undo':
      return chain.undo().run();
    case 'redo':
      return chain.redo().run();
  }
}

export function runPageEditorCommand(editor: Editor, command: PageEditorCommand): boolean {
  const chain = editor.chain().focus();

  switch (command) {
    case 'paragraph':
      return chain.setParagraph().run();
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
      return chain.toggleHeading({ level: Number(command.at(-1)) as 1 | 2 | 3 }).run();
    case 'bullet-list':
      return chain.toggleBulletList().run();
    case 'ordered-list':
      return chain.toggleOrderedList().run();
    case 'task-list':
      return chain.toggleTaskList().run();
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'strike':
      return chain.toggleStrike().run();
    case 'inline-code':
      return chain.toggleCode().run();
    case 'undo':
      return chain.undo().run();
    case 'redo':
      return chain.redo().run();
  }
}
