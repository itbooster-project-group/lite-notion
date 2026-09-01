import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { createPageDocumentRelativeSelection } from '../../model/page-document-relative-selection';
import { LinkForm } from './link-form';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];
const elements: HTMLElement[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  for (const element of elements) element.remove();
  editors.length = 0;
  documents.length = 0;
  elements.length = 0;
});

function createEditor(): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const doc = new Y.Doc();
  const editor = new Editor({ element, extensions: createPageDocumentEditorExtensions(doc) });
  editor.commands.setContent('<p>Текст</p>');
  editor.commands.setTextSelection({ from: 1, to: 6 });
  elements.push(element);
  documents.push(doc);
  editors.push(editor);
  return editor;
}

function createEditorForDocument(doc: Y.Doc): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: createPageDocumentEditorExtensions(doc) });
  elements.push(element);
  editors.push(editor);
  return editor;
}

describe('link form', () => {
  it('нормализует адрес, применяет mark и возвращает focus в editor', async () => {
    const editor = createEditor();
    const initialSelection = createPageDocumentRelativeSelection(editor);
    expect(initialSelection).toBeDefined();
    editor.commands.setTextSelection(6);
    expect(editor.can().setLink({ href: 'https://example.com' })).toBe(true);
    const onClose = vi.fn();
    render(<LinkForm editor={editor} initialSelection={initialSelection} onClose={onClose} />);

    const urlInput = screen.getByRole('textbox', { name: 'Адрес ссылки' });
    expect(urlInput).toHaveAttribute('type', 'text');
    fireEvent.change(urlInput, {
      target: { value: 'example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ attrs: { href: 'https://example.com/docs' }, type: 'link' }],
              text: 'Текст',
            },
          ],
        },
      ],
    });
    await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
  });

  it('показывает safe error и не меняет document для unsafe scheme', () => {
    const editor = createEditor();
    render(<LinkForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Укажите корректный адрес ссылки.');
    expect(editor.getJSON()).not.toMatchObject({ marks: [{ type: 'link' }] });
  });

  it('вставляет кликабельный адрес при пустом выделении', () => {
    const editor = createEditor();
    editor.commands.setTextSelection(6);
    render(<LinkForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            { text: 'Текст' },
            {
              marks: [{ attrs: { href: 'https://example.com/' }, type: 'link' }],
              text: 'https://example.com/',
            },
          ],
        },
      ],
    });
  });

  it('удаляет existing link mark', () => {
    const editor = createEditor();
    editor.commands.setLink({ href: 'https://example.com' });
    render(<LinkForm editor={editor} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Удалить ссылку' }));

    expect(editor.getJSON()).not.toMatchObject({ marks: [{ type: 'link' }] });
  });

  it('сохраняет логическое выделение при collaborative insertion перед ним', () => {
    const doc = new Y.Doc();
    documents.push(doc);
    const editorA = createEditorForDocument(doc);
    editorA.commands.setContent('<p>hello world</p>');
    const editorB = createEditorForDocument(doc);

    editorA.commands.setTextSelection({ from: 7, to: 12 });
    const initialSelection = createPageDocumentRelativeSelection(editorA);
    expect(initialSelection).toBeDefined();

    render(<LinkForm editor={editorA} initialSelection={initialSelection} onClose={vi.fn()} />);

    editorB.commands.insertContentAt(7, 'beautiful ');
    expect(editorA.getText()).toBe('hello beautiful world');

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'example.com/world' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(editorA.getJSON().content?.[0]?.content).toEqual([
      { text: 'hello beautiful ', type: 'text' },
      {
        marks: [{ attrs: { href: 'https://example.com/world' }, type: 'link' }],
        text: 'world',
        type: 'text',
      },
    ]);
  });

  it('не применяет stale relative selection к другому document', () => {
    const sourceEditor = createEditor();
    const initialSelection = createPageDocumentRelativeSelection(sourceEditor);
    expect(initialSelection).toBeDefined();

    const replacementEditor = createEditor();
    const before = replacementEditor.getJSON();
    render(
      <LinkForm editor={replacementEditor} initialSelection={initialSelection} onClose={vi.fn()} />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Выделение больше недоступно');
    expect(replacementEditor.getJSON()).toEqual(before);
  });

  it('не изменяет document для unresolvable relative position', () => {
    const editor = createEditor();
    const initialSelection = createPageDocumentRelativeSelection(editor);
    expect(initialSelection).toBeDefined();
    if (!initialSelection) return;

    const unresolvableSelection = {
      ...initialSelection,
      from: new Y.RelativePosition(null, null, Y.createID(999_999, 1)),
      to: new Y.RelativePosition(null, null, Y.createID(999_999, 2)),
    };
    const before = editor.getJSON();
    render(<LinkForm editor={editor} initialSelection={unresolvableSelection} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Выделение больше недоступно');
    expect(editor.getJSON()).toEqual(before);
  });

  it('очищает сохранённое выделение при закрытии', () => {
    const editor = createEditor();
    const before = editor.getJSON();
    render(<LinkForm editor={editor} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес ссылки' }), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Выделение больше недоступно');
    expect(editor.getJSON()).toEqual(before);
  });
});
