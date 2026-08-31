import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { canRunPageEditorCommand, runPageEditorCommand } from './editor-commands';

describe('page editor commands', () => {
  it('форматирует Yjs-backed content без отдельной JSON-копии', () => {
    const doc = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    editor.commands.insertContent('Текст');
    editor.commands.selectAll();

    expect(runPageEditorCommand(editor, 'bold')).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      content: [{ content: [{ marks: [{ type: 'bold' }], text: 'Текст', type: 'text' }] }],
    });

    editor.destroy();
    doc.destroy();
  });

  it('использует undo и redo, совместимые с Collaboration/Yjs', () => {
    const doc = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    editor.commands.insertContent('Текст');

    expect(canRunPageEditorCommand(editor, 'undo')).toBe(true);
    expect(runPageEditorCommand(editor, 'undo')).toBe(true);
    expect(editor.getText()).toBe('');
    expect(canRunPageEditorCommand(editor, 'redo')).toBe(true);
    expect(runPageEditorCommand(editor, 'redo')).toBe(true);
    expect(editor.getText()).toBe('Текст');

    editor.destroy();
    doc.destroy();
  });

  it('преобразует текущий block в heading и сохраняет его content', () => {
    const doc = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    editor.commands.insertContent('Заголовок');

    expect(runPageEditorCommand(editor, 'heading-1')).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          attrs: { level: 1 },
          content: [{ text: 'Заголовок', type: 'text' }],
          type: 'heading',
        },
      ],
    });

    editor.destroy();
    doc.destroy();
  });
});
