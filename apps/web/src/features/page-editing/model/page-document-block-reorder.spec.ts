import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { canMovePageDocumentBlock, movePageDocumentBlock } from './page-document-block-reorder';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor() {
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  editor.commands.setContent('<p>Первый</p><h2>Второй</h2><ul><li><p>Третий</p></li></ul>');
  editors.push(editor);
  documents.push(document);
  return editor;
}

describe('page document top-level block reorder', () => {
  it('перемещает top-level block вверх одной transaction и сохраняет selection на блоке', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(10);

    expect(canMovePageDocumentBlock(editor, 'up')).toBe(true);
    expect(movePageDocumentBlock(editor, 'up')).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      content: [
        { attrs: { level: 2 }, type: 'heading' },
        { type: 'paragraph' },
        { type: 'bulletList' },
      ],
    });
    expect(editor.state.selection.constructor.name).toBe('NodeSelection');
  });

  it('перемещает top-level list вниз и отключает направления на document boundaries', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(2);

    expect(canMovePageDocumentBlock(editor, 'up')).toBe(false);
    expect(movePageDocumentBlock(editor, 'up')).toBe(false);
    expect(movePageDocumentBlock(editor, 'down')).toBe(true);
    expect(editor.getJSON().content?.map(({ type }) => type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
    ]);
    expect(canMovePageDocumentBlock(editor, 'down')).toBe(true);

    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    expect(canMovePageDocumentBlock(editor, 'down')).toBe(false);
  });
});
