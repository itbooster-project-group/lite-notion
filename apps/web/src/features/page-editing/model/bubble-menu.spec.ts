import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { shouldShowPageEditorBubbleMenu } from './bubble-menu';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor(): Editor {
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  editors.push(editor);
  documents.push(document);
  return editor;
}

describe('page editor bubble menu visibility', () => {
  it('показывается только для non-empty selection в editable editor', () => {
    const editor = createEditor();

    expect(shouldShowPageEditorBubbleMenu(editor, 2, 2)).toBe(false);
    expect(shouldShowPageEditorBubbleMenu(editor, 2, 3)).toBe(true);

    editor.setEditable(false);
    expect(shouldShowPageEditorBubbleMenu(editor, 2, 3)).toBe(false);
  });
});
