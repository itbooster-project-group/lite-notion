import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { BlockReorderControls } from './block-reorder-controls';

vi.mock('@tiptap/extension-drag-handle-react', () => ({
  DragHandle: ({ children, nested }: Readonly<{ children: ReactNode; nested: boolean }>) => (
    <div data-nested={String(nested)}>{children}</div>
  ),
}));

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
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  editor.commands.setContent('<p>Первый</p><h2>Второй</h2>');
  editor.commands.setTextSelection(2);
  documents.push(document);
  editors.push(editor);
  return editor;
}

describe('block reorder controls', () => {
  it('предоставляет pointer handle и keyboard-reachable move actions с disabled boundary', () => {
    const editor = createEditor();
    render(<BlockReorderControls editor={editor} />);

    const pointerHandle = screen.getByRole('button', { name: 'Перетащить блок' });
    expect(pointerHandle.parentElement).toHaveAttribute('data-nested', 'false');
    expect(pointerHandle).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Переместить вверх' })).toBeDisabled();
    const moveDown = screen.getByRole('button', { name: 'Переместить вниз' });
    const keyboardControls = screen.getByRole('group', {
      name: 'Перемещение блока с клавиатуры',
    });
    expect(keyboardControls.className).toContain('focus-within:not-sr-only');
    expect(keyboardControls.className).toContain('focus-within:fixed');

    moveDown.focus();
    expect(moveDown).toHaveFocus();
    expect(moveDown.className).toContain('focus-visible:ring-2');

    fireEvent.click(moveDown);

    expect(editor.getJSON().content?.map(({ type }) => type)).toEqual(['heading', 'paragraph']);
    expect(screen.getByRole('button', { name: 'Переместить вниз' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Переместить вверх' })).toBeEnabled();
  });
});
