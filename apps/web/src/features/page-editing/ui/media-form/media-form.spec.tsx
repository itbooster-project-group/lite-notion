import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import { ImageForm } from './image-form';
import { VideoForm } from './video-form';
import { YoutubeForm } from './youtube-form';

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
  editors.push(editor);
  documents.push(doc);
  elements.push(element);
  return editor;
}

describe('media forms', () => {
  it('вставляет изображение с generated node ID и возвращает focus в editor', async () => {
    const editor = createEditor();
    const onClose = vi.fn();
    render(<ImageForm editor={editor} onClose={onClose} />);

    expect(screen.getByRole('textbox', { name: 'Адрес изображения' })).toHaveFocus();
    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес изображения' }), {
      target: { value: 'https://cdn.example.com/image.png' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание изображения' }), {
      target: { value: 'Горный пейзаж' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          attrs: {
            alt: 'Горный пейзаж',
            nodeId: expect.any(String),
            src: 'https://cdn.example.com/image.png',
          },
          type: 'image',
        },
      ],
    });
    await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
  });

  it('показывает error и не вставляет image для unsafe URL', () => {
    const editor = createEditor();
    render(<ImageForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес изображения' }), {
      target: { value: 'http://example.com/image.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Укажите HTTPS-адрес и корректное текстовое описание изображения.',
    );
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'image' }] });
  });

  it('normalizes YouTube URL to video ID', async () => {
    const editor = createEditor();
    render(<YoutubeForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ссылка на YouTube' }), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить видео' }));

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          attrs: { nodeId: expect.any(String), videoId: 'dQw4w9WgXcQ' },
          type: 'youtube',
        },
      ],
    });
    await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
  });

  it('показывает error для invalid YouTube URL', () => {
    const editor = createEditor();
    render(<YoutubeForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ссылка на YouTube' }), {
      target: { value: 'https://example.com/watch?v=dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить видео' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Укажите корректную ссылку на YouTube.');
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'youtube' }] });
  });

  it('вставляет только HTTPS MP4/WebM video и отклоняет иной URL', () => {
    const editor = createEditor();
    render(<VideoForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес видео' }), {
      target: { value: 'https://cdn.example.com/video.mp4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить видео' }));

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          attrs: { nodeId: expect.any(String), src: 'https://cdn.example.com/video.mp4' },
          type: 'video',
        },
      ],
    });
  });

  it('показывает error для unsupported direct video URL', () => {
    const editor = createEditor();
    render(<VideoForm editor={editor} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Адрес видео' }), {
      target: { value: 'https://cdn.example.com/video.mov' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить видео' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Укажите HTTPS-адрес MP4 или WebM видео.');
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'video' }] });
  });
});
