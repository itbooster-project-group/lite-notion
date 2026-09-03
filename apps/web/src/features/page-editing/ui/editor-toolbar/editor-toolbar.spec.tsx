import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { EditorToolbar } from './editor-toolbar';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor(): Editor {
  const doc = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
  documents.push(doc);
  editors.push(editor);
  return editor;
}

describe('editor history controls', () => {
  it('показывает только доступные undo и redo actions', async () => {
    const editor = createEditor();
    render(<EditorToolbar editor={editor} />);

    expect(screen.queryByRole('toolbar', { name: 'История изменений' })).toBeNull();

    editor.commands.insertContent('Текст');

    const undo = await screen.findByRole('button', { name: 'Отменить' });
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    fireEvent.click(undo);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
    });
  });
});
