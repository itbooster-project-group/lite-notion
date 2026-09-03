import type { Editor } from '@tiptap/core';

export function shouldShowPageEditorBubbleMenu(editor: Editor, from: number, to: number): boolean {
  return editor.isEditable && from !== to;
}
