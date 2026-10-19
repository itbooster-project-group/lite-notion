import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';
import * as api from '@/shared/api';
import { AssetUploadError } from '@/shared/api';

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
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
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

    fireEvent.click(screen.getByRole('tab', { name: 'По ссылке' }));
    expect(screen.getByRole('textbox', { name: 'Ссылка на изображение' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ссылка на изображение' }), {
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

    fireEvent.click(screen.getByRole('tab', { name: 'По ссылке' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ссылка на изображение' }), {
      target: { value: 'http://example.com/image.png' },
    });
    expect(screen.getByRole('button', { name: 'Вставить изображение' })).toBeDisabled();
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'image' }] });
  });

  it('переключает способ добавления и очищает object URL при замене файла и закрытии', () => {
    const editor = createEditor();
    const { unmount } = render(<ImageForm editor={editor} onClose={vi.fn()} />);
    const input = screen.getByLabelText('Выбрать файл изображения');
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(
      ['second'],
      'a-very-long-image-name-that-must-not-break-the-dialog-layout.png',
      {
        type: 'image/png',
      },
    );

    fireEvent.change(input, { target: { files: [first] } });
    expect(document.querySelector('img[src="blob:preview"]')).toBeInTheDocument();
    expect(screen.getByText(first.name)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(first);

    fireEvent.click(screen.getByRole('tab', { name: 'По ссылке' }));
    expect(screen.getByRole('textbox', { name: 'Ссылка на изображение' })).toBeVisible();
    expect(document.getElementById('image-upload-panel')).not.toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Загрузить файл' }));
    fireEvent.change(input, { target: { files: [second] } });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(screen.getByText(second.name)).toBeInTheDocument();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('allows insertion of a decorative image without alt text only after explicit selection', async () => {
    const editor = createEditor();
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: '22222222-2222-4222-8222-222222222222',
      contentPath: '/api/v1/assets/22222222-2222-4222-8222-222222222222/content',
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'decorative.png',
    });
    render(<ImageForm editor={editor} onClose={vi.fn()} pageId="page-1" />);
    const submit = screen.getByRole('button', { name: 'Вставить изображение' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [new File(['png'], 'decorative.png', { type: 'image/png' })] },
    });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Декоративное изображение' }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(editor.getJSON()).toMatchObject({
        content: [{ attrs: { alt: '', decorative: true }, type: 'image' }],
      }),
    );
    expect(initiate).toHaveBeenCalledOnce();
  });

  it('загружает ready asset один раз с pageId и вставляет узел только после подтверждения', async () => {
    const editor = createEditor();
    const assetId = '22222222-2222-4222-8222-222222222222';
    const ready = Promise.withResolvers<{
      id: string;
      status: 'ready';
      mimeType: string;
      sizeBytes: number;
      originalName: string;
    }>();
    const initiate = vi
      .spyOn(api, 'initiateAssetUpload')
      .mockResolvedValue({ assetId, contentPath: `/api/v1/assets/${assetId}/content` });
    const grant = vi.spyOn(api, 'grantAssetToPage');
    const upload = vi.spyOn(api, 'uploadAssetContentWithProgress').mockReturnValue(ready.promise);
    const onClose = vi.fn();
    render(<ImageForm editor={editor} onClose={onClose} pageId="page-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание изображения' }), {
      target: { value: 'Карта проекта' },
    });
    const file = new File(['png'], 'map.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    await waitFor(() => expect(upload).toHaveBeenCalledWith(assetId, file, expect.any(Function)));
    expect(initiate).toHaveBeenCalledWith({ fileName: 'map.png', pageId: 'page-1' });
    expect(initiate).toHaveBeenCalledOnce();
    expect(grant).not.toHaveBeenCalled();
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'image' }] });
    ready.resolve({
      id: assetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'map.png',
    });
    await waitFor(() =>
      expect(editor.getJSON()).toMatchObject({
        content: [
          {
            type: 'image',
            attrs: {
              alt: 'Карта проекта',
              decorative: false,
              nodeId: expect.any(String),
              source: { type: 'asset', assetId },
              src: null,
            },
          },
        ],
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it('повторяет неоднозначный upload того же Blob и asset без повторной инициации', async () => {
    const editor = createEditor();
    const assetId = '22222222-2222-4222-8222-222222222222';
    const initiate = vi
      .spyOn(api, 'initiateAssetUpload')
      .mockResolvedValue({ assetId, contentPath: `/api/v1/assets/${assetId}/content` });
    const upload = vi
      .spyOn(api, 'uploadAssetContentWithProgress')
      .mockRejectedValueOnce(new AssetUploadError('unknown result', undefined, true))
      .mockResolvedValue({
        id: assetId,
        status: 'ready',
        mimeType: 'image/png',
        sizeBytes: 3,
        originalName: 'map.png',
      });
    render(<ImageForm editor={editor} onClose={vi.fn()} pageId="page-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание изображения' }), {
      target: { value: 'Карта' },
    });
    const file = new File(['same bytes'], 'map.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить загрузку' }));

    await waitFor(() => expect(editor.getJSON()).toMatchObject({ content: [{ type: 'image' }] }));
    expect(initiate).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map(([id, blob]) => [id, blob])).toEqual([
      [assetId, file],
      [assetId, file],
    ]);
  });

  it('не запускает повторную инициацию после неоднозначного ответа POST', async () => {
    const editor = createEditor();
    const initiate = vi
      .spyOn(api, 'initiateAssetUpload')
      .mockRejectedValue(new TypeError('network'));
    render(<ImageForm editor={editor} onClose={vi.fn()} pageId="page-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание изображения' }), {
      target: { value: 'Карта' },
    });
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [new File(['png'], 'map.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('не создать дубликат');
    expect(screen.getByLabelText('Выбрать файл изображения')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вставить изображение' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));
    expect(initiate).toHaveBeenCalledOnce();
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'image' }] });
  });

  it('не вставляет image и не повторяет upload при отказе в permission', async () => {
    const editor = createEditor();
    const initiate = vi
      .spyOn(api, 'initiateAssetUpload')
      .mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    const upload = vi.spyOn(api, 'uploadAssetContentWithProgress');
    render(<ImageForm editor={editor} onClose={vi.fn()} pageId="page-1" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание изображения' }), {
      target: { value: 'Карта' },
    });
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [new File(['png'], 'map.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет прав начать загрузку');
    expect(initiate).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Вставить изображение' })).toBeDisabled();
    expect(editor.getJSON()).not.toMatchObject({ content: [{ type: 'image' }] });
  });

  it('проверяет alt/decorative до создания upload asset', async () => {
    const editor = createEditor();
    const initiate = vi.spyOn(api, 'initiateAssetUpload');
    render(<ImageForm editor={editor} onClose={vi.fn()} pageId="page-1" />);
    fireEvent.change(screen.getByLabelText('Выбрать файл изображения'), {
      target: { files: [new File(['png'], 'map.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Вставить изображение' }));

    expect(screen.getByRole('button', { name: 'Вставить изображение' })).toBeDisabled();
    expect(initiate).not.toHaveBeenCalled();
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
