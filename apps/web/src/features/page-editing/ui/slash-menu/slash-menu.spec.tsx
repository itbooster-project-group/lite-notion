import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { LinkForm } from '../link-form';
import { ImageForm } from '../media-form';
import { SlashMenu } from './slash-menu';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor(content: string): Editor {
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  editor.commands.setContent(`<p>${content}</p>`);
  editor.commands.setTextSelection(content.length + 1);
  vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
    bottom: 40,
    left: 24,
    right: 24,
    top: 24,
  });
  documents.push(document);
  editors.push(editor);
  return editor;
}

describe('slash menu', () => {
  it('удаляет media query по Enter и передаёт focus в первое поле формы', async () => {
    const editor = createEditor('/изо');
    let keyDownHandler: ((event: KeyboardEvent) => boolean) | undefined;
    const onClose = vi.fn();

    function SlashMenuWithImageForm() {
      const [imageFormOpen, setImageFormOpen] = useState(false);

      return (
        <>
          <SlashMenu
            editor={editor}
            onKeyDownChange={(handler) => {
              keyDownHandler = handler;
            }}
            onLinkCommand={vi.fn()}
            onMediaCommand={(mediaType) => setImageFormOpen(mediaType === 'image')}
          />
          {imageFormOpen && <ImageForm editor={editor} onClose={onClose} />}
        </>
      );
    }

    render(<SlashMenuWithImageForm />);

    expect(screen.getByRole('listbox', { name: 'Команды редактора' })).toHaveClass('fixed');
    expect(screen.getByRole('option', { name: 'Изображение' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    act(() => {
      keyDownHandler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' }));
    });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Адрес изображения' })).toHaveFocus(),
    );
    expect(editor.getText()).toBe('');
  });

  it('открывает link form из slash menu и удаляет query', async () => {
    const editor = createEditor('/ссы');
    let keyDownHandler: ((event: KeyboardEvent) => boolean) | undefined;

    function SlashMenuWithLinkForm() {
      const [linkFormOpen, setLinkFormOpen] = useState(false);

      return (
        <>
          <SlashMenu
            editor={editor}
            onKeyDownChange={(handler) => {
              keyDownHandler = handler;
            }}
            onLinkCommand={() => setLinkFormOpen(true)}
            onMediaCommand={vi.fn()}
          />
          {linkFormOpen && <LinkForm editor={editor} onClose={vi.fn()} />}
        </>
      );
    }

    render(<SlashMenuWithLinkForm />);

    expect(screen.getByRole('option', { name: 'Ссылка' })).toHaveAttribute('aria-selected', 'true');
    act(() => {
      keyDownHandler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' }));
    });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Адрес ссылки' })).toHaveFocus(),
    );
    expect(editor.getText()).toBe('');
  });

  it('закрывает slash menu с Escape и удаляет query', () => {
    const editor = createEditor('/заг');
    let keyDownHandler: ((event: KeyboardEvent) => boolean) | undefined;

    render(
      <SlashMenu
        editor={editor}
        onKeyDownChange={(handler) => {
          keyDownHandler = handler;
        }}
        onLinkCommand={vi.fn()}
        onMediaCommand={vi.fn()}
      />,
    );

    act(() => {
      keyDownHandler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' }));
    });

    expect(screen.queryByRole('listbox', { name: 'Команды редактора' })).toBeNull();
    expect(editor.getText()).toBe('');
  });

  it('пересчитывает fixed position при scroll/resize и очищает listeners', async () => {
    const editor = createEditor('/заг');
    const coordinates = vi.mocked(editor.view.coordsAtPos);
    const view = render(
      <SlashMenu
        editor={editor}
        onKeyDownChange={vi.fn()}
        onLinkCommand={vi.fn()}
        onMediaCommand={vi.fn()}
      />,
    );
    const menu = screen.getByRole('listbox', { name: 'Команды редактора' });

    coordinates.mockClear();
    coordinates.mockReturnValue({ bottom: 90, left: 64, right: 64, top: 74 });
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    await waitFor(() => expect(menu).toHaveStyle({ left: '64px', top: '98px' }));
    expect(coordinates).toHaveBeenCalledTimes(1);

    coordinates.mockClear();
    coordinates.mockReturnValue({ bottom: 130, left: 88, right: 88, top: 114 });
    fireEvent.resize(window);
    await waitFor(() => expect(menu).toHaveStyle({ left: '88px', top: '138px' }));
    expect(coordinates).toHaveBeenCalledTimes(1);

    view.unmount();
    coordinates.mockClear();
    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(coordinates).not.toHaveBeenCalled();
  });
});
