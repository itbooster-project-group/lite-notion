import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions, pageDocumentToJSON } from '@/entities/page-document';
import { server } from '@/shared/api/mocks/server';
import type { CollaborationProvider } from '@/shared/collaboration';
import { PageEditorSurface } from './page-editor-surface';

const documents: Y.Doc[] = [];

function createDocument(content: string): Y.Doc {
  const doc = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
  editor.commands.setContent(content);
  editor.destroy();
  documents.push(doc);
  return doc;
}

function getTopLevelText(doc: Y.Doc): string[] {
  return (
    pageDocumentToJSON(doc).content?.map(
      (node) => node.content?.map((child) => child.text ?? '').join('') ?? '',
    ) ?? []
  );
}

afterEach(() => {
  cleanup();
  for (const doc of documents) doc.destroy();
  documents.length = 0;
});

describe('page editor surface document lifecycle', () => {
  it('закрывает LinkForm и очищает document-specific selection при замене Y.Doc', async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    documents.push(docA, docB);

    const view = render(<PageEditorSurface doc={docA} editable />);
    const editor = await screen.findByRole('textbox', { name: 'Содержимое страницы' });

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'k' });
    const staleApplyButton = await screen.findByRole('button', { name: 'Применить' });
    expect(screen.getByRole('form', { name: 'Ссылка' })).toBeInTheDocument();

    view.rerender(<PageEditorSurface doc={docB} editable />);

    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Ссылка' })).not.toBeInTheDocument(),
    );
    const replacementContent = pageDocumentToJSON(docB);

    staleApplyButton.click();

    expect(pageDocumentToJSON(docB)).toEqual(replacementContent);
  });

  it('не показывает и не передаёт commands stale editor после замены Y.Doc', async () => {
    const docA = createDocument('<p>Secret A</p><p>Second A</p>');
    const docB = createDocument('<p>Visible B</p><p>Second B</p>');
    const view = render(<PageEditorSurface doc={docA} editable />);
    const staleContent = await screen.findByRole('textbox', { name: 'Содержимое страницы' });
    expect(staleContent).toHaveTextContent('Secret A');

    const staleMoveDown = screen.getByRole('button', { name: 'Переместить вниз' });
    await waitFor(() => expect(staleMoveDown).toBeEnabled());
    fireEvent.click(staleMoveDown);
    await waitFor(() => expect(getTopLevelText(docA)).toEqual(['Second A', 'Secret A']));
    const staleUndo = await screen.findByRole('button', { name: 'Отменить' });
    const docABeforeReplacement = pageDocumentToJSON(docA);

    view.rerender(<PageEditorSurface doc={docB} editable />);

    expect(screen.queryByText('Secret A')).not.toBeInTheDocument();
    staleUndo.click();
    staleMoveDown.click();
    fireEvent.keyDown(staleContent, { key: 'x' });
    fireEvent.input(staleContent, {
      inputType: 'insertText',
      target: { textContent: 'stale edit' },
    });
    expect(pageDocumentToJSON(docA)).toEqual(docABeforeReplacement);

    const replacementContent = await screen.findByRole('textbox', {
      name: 'Содержимое страницы',
    });
    expect(replacementContent).toHaveTextContent('Visible B');
    expect(
      screen.getByRole('group', { name: 'Перемещение блока с клавиатуры' }),
    ).toBeInTheDocument();

    const replacementMoveDown = screen.getByRole('button', { name: 'Переместить вниз' });
    await waitFor(() => expect(replacementMoveDown).toBeEnabled());
    fireEvent.click(replacementMoveDown);
    await waitFor(() => expect(getTopLevelText(docB)).toEqual(['Second B', 'Visible B']));

    const replacementUndo = await screen.findByRole('button', { name: 'Отменить' });
    fireEvent.click(replacementUndo);
    await waitFor(() => expect(getTopLevelText(docB)).toEqual(['Visible B', 'Second B']));
    expect(pageDocumentToJSON(docA)).toEqual(docABeforeReplacement);
  });

  it('не допускает поздний editor промежуточного Y.Doc при быстрой замене A → B → C', async () => {
    const docA = createDocument('<p>Secret A</p>');
    const docB = createDocument('<p>Secret B</p>');
    const docC = createDocument('<p>Visible C</p>');
    const view = render(<PageEditorSurface doc={docA} editable />);
    await screen.findByText('Secret A');

    view.rerender(<PageEditorSurface doc={docB} editable />);
    view.rerender(<PageEditorSurface doc={docC} editable />);

    expect(screen.queryByText('Secret A')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret B')).not.toBeInTheDocument();
    const currentContent = await screen.findByRole('textbox', { name: 'Содержимое страницы' });
    expect(currentContent).toHaveTextContent('Visible C');
    await waitFor(() => expect(screen.queryByText('Secret B')).not.toBeInTheDocument());
  });

  it('подключает CollaborationCaret к существующему provider и сохраняет viewer read-only', async () => {
    const doc = new Y.Doc();
    const websocket = new HocuspocusProviderWebsocket({
      url: 'ws://collaboration.test',
      autoConnect: false,
    });
    const provider = new HocuspocusProvider({
      name: 'page:test',
      document: doc,
      websocketProvider: websocket,
      token: async () => 'token',
    });
    const view = render(
      <PageEditorSurface
        collaboration={{
          provider: provider as CollaborationProvider,
          user: { id: 'viewer-id', name: 'Viewer', color: '#2563eb' },
        }}
        doc={doc}
        editable={false}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Содержимое страницы' });
    const awareness = provider.awareness;
    if (!awareness) throw new Error('Hocuspocus provider must expose Awareness');
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(awareness.getLocalState()?.user).toEqual({
      id: 'viewer-id',
      name: 'Viewer',
      color: '#2563eb',
    });

    view.unmount();
    provider.destroy();
    websocket.destroy();
    doc.destroy();
  });

  it('оставляет unavailable asset node удаляемым и не меняет Y.Doc при ошибке чтения', async () => {
    const doc = new Y.Doc();
    documents.push(doc);
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            nodeId: '11111111-1111-4111-8111-111111111111',
            source: { type: 'asset', assetId: '22222222-2222-4222-8222-222222222222' },
            src: null,
            alt: 'Описание',
            decorative: false,
          },
        },
      ],
    });
    editor.destroy();
    server.use(
      http.post('*/api/v1/assets/:assetId/read-url', () => HttpResponse.json({}, { status: 403 })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <PageEditorSurface doc={doc} editable pageId="page-1" userId="editor-1" />
      </QueryClientProvider>,
    );
    const documentUpdate = vi.fn();
    doc.on('update', documentUpdate);

    expect(await screen.findByText('Изображение недоступно')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Удалить изображение' })).toBeEnabled(),
    );
    expect(documentUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить изображение' }));
    await waitFor(() => expect(pageDocumentToJSON(doc).content).toEqual([{ type: 'paragraph' }]));
    expect(documentUpdate).toHaveBeenCalledOnce();

    view.unmount();
    queryClient.clear();
  });

  it('сохраняет legacy external image и показывает fallback при ошибке загрузки без Y.Doc update', async () => {
    const doc = new Y.Doc();
    documents.push(doc);
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            nodeId: '11111111-1111-4111-8111-111111111111',
            source: null,
            src: 'https://example.com/legacy-image.jpg',
            alt: 'Legacy image',
            decorative: false,
          },
        },
      ],
    });
    editor.destroy();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <PageEditorSurface doc={doc} editable pageId="page-1" userId="editor-1" />
      </QueryClientProvider>,
    );
    const documentUpdate = vi.fn();
    doc.on('update', documentUpdate);
    const image = await screen.findByRole('img', { name: 'Legacy image' });
    expect(image).toHaveAttribute('src', 'https://example.com/legacy-image.jpg');

    fireEvent.error(image);

    expect(await screen.findByText('Изображение недоступно')).toBeInTheDocument();
    expect(documentUpdate).not.toHaveBeenCalled();
    expect(pageDocumentToJSON(doc).content).toMatchObject([{ type: 'image' }]);
    view.unmount();
    queryClient.clear();
  });
});
