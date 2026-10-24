import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '../../model/page-document-editor-extensions';

import { LinkForm } from '../link-form';
import { ImageForm } from '../media-form';
import { SlashMenu } from './slash-menu';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

afterEach(() => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
  if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
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
  it('показывает иконку у каждой существующей команды', () => {
    const editor = createEditor('/');
    render(
      <SlashMenu
        editor={editor}
        onKeyDownChange={vi.fn()}
        onLinkCommand={vi.fn()}
        onMediaCommand={vi.fn()}
      />,
    );

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(11);
    const iconNames = options.map(
      (option) =>
        option
          .querySelector('svg[aria-hidden="true"]')
          ?.getAttribute('class')
          ?.match(/lucide-([\w-]+)/)?.[1],
    );
    expect(iconNames).toEqual([
      'pilcrow',
      'heading1',
      'heading2',
      'heading3',
      'list',
      'list-ordered',
      'list-todo',
      'link',
      'image',
      'circle-play',
      'video',
    ]);
  });

  it('сохраняет клавиатурный выбор и прокручивает активный пункт в видимую область', async () => {
    const editor = createEditor('/ви');
    let keyDownHandler: ((event: KeyboardEvent) => boolean) | undefined;
    const scrolledItems: HTMLElement[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: HTMLElement) {
        scrolledItems.push(this);
      },
    });
    const onMediaCommand = vi.fn();

    render(
      <SlashMenu
        editor={editor}
        onKeyDownChange={(handler) => {
          keyDownHandler = handler;
        }}
        onLinkCommand={vi.fn()}
        onMediaCommand={onMediaCommand}
      />,
    );

    const youtubeOption = screen.getByRole('option', { name: 'YouTube видео' });
    const videoOption = screen.getByRole('option', { name: 'Видео' });
    expect(youtubeOption).toHaveAttribute('aria-selected', 'true');

    act(() => {
      keyDownHandler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' }));
    });
    expect(videoOption).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(scrolledItems.at(-1)).toBe(videoOption));

    act(() => {
      keyDownHandler?.(new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' }));
    });
    expect(onMediaCommand).toHaveBeenCalledWith('video');
    expect(editor.getText()).toBe('');
  });

  it('удерживает меню у нижнего края маленького viewport', async () => {
    const editor = createEditor('/зада');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
    const coordinates = vi.mocked(editor.view.coordsAtPos);
    coordinates.mockReturnValue({ bottom: 210, left: 64, right: 64, top: 190 });

    render(
      <SlashMenu
        editor={editor}
        onKeyDownChange={vi.fn()}
        onLinkCommand={vi.fn()}
        onMediaCommand={vi.fn()}
      />,
    );

    const menu = screen.getByRole('listbox', { name: 'Команды редактора' });
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
      bottom: 204,
      height: 204,
      left: 64,
      right: 352,
      top: 0,
      width: 288,
      x: 64,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.resize(window);

    await waitFor(() => expect(menu).toHaveStyle({ top: '8px' }));
  });

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

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Загрузить файл' })).toHaveFocus());
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
