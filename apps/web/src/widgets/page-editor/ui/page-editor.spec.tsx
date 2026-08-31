import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  createPageDocumentEditorExtensions,
  PAGE_DOCUMENT_SCHEMA_VERSION,
} from '@/entities/page-document';
import {
  createInMemoryPageDocumentSession,
  type PageDocumentSession,
} from '@/features/page-editing';

import { PageEditor } from './page-editor';

afterEach(cleanup);

describe('page editor composition', () => {
  it('не монтирует surface во время loading', () => {
    const session: PageDocumentSession = {
      doc: null,
      editable: false,
      status: 'loading',
      destroy: vi.fn(),
    };

    render(<PageEditor session={session} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).toBeNull();
  });

  it('не монтирует surface при admission error и не показывает raw detail', () => {
    const session: PageDocumentSession = {
      doc: null,
      editable: false,
      status: 'error',
      error: {
        code: 'unsupported-schema-version',
        message: 'raw adapter detail',
      },
      destroy: vi.fn(),
    };

    render(<PageEditor session={session} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Версия документа не поддерживается.');
    expect(screen.queryByText('raw adapter detail')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).toBeNull();
  });

  it('монтирует surface только для admitted ready Y.Doc', async () => {
    const session = createInMemoryPageDocumentSession({
      doc: new Y.Doc(),
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    const view = render(<PageEditor session={session} />);

    const editor = await screen.findByRole('textbox', { name: 'Содержимое страницы' });
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor).toHaveAttribute('data-page-editor-content', '');
    expect(editor.className).toContain('editorContent');
    expect(screen.queryByRole('toolbar', { name: 'Форматирование' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'История изменений' })).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Контекстное форматирование' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();

    view.unmount();
  });

  it('показывает content без изменяющего режима при editable=false', async () => {
    const session = createInMemoryPageDocumentSession({
      doc: new Y.Doc(),
      editable: false,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    const view = render(<PageEditor session={session} />);

    expect(screen.getByRole('status')).toHaveTextContent('только для чтения');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(await screen.findByRole('textbox', { name: 'Содержимое страницы' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(screen.queryByRole('toolbar', { name: 'История изменений' })).toBeNull();

    view.unmount();
  });

  it('располагает checkbox и текст task item в одной строке', async () => {
    const doc = new Y.Doc();
    const setupEditor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    setupEditor.commands.setContent({
      content: [
        {
          content: [
            {
              attrs: { checked: false },
              content: [
                {
                  content: [{ text: 'Задача', type: 'text' }],
                  type: 'paragraph',
                },
              ],
              type: 'taskItem',
            },
          ],
          type: 'taskList',
        },
      ],
      type: 'doc',
    });
    setupEditor.destroy();
    const session = createInMemoryPageDocumentSession({
      doc,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    const view = render(<PageEditor session={session} />);

    const checkbox = await screen.findByRole('checkbox');
    const taskItem = checkbox.closest('li[data-checked]');
    expect(taskItem).not.toBeNull();
    expect(taskItem).toHaveAttribute('data-checked', 'false');
    expect(taskItem).toHaveTextContent('Задача');

    view.unmount();
  });

  it('открывает link form по Mod-K только в editable editor', async () => {
    const session = createInMemoryPageDocumentSession({
      doc: new Y.Doc(),
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });
    const view = render(<PageEditor session={session} />);
    const editor = await screen.findByRole('textbox', { name: 'Содержимое страницы' });

    fireEvent.keyDown(editor, { ctrlKey: true, key: 'k' });

    expect(await screen.findByRole('dialog', { name: 'Добавить ссылку' })).toBeInTheDocument();
    expect(screen.getByText(/автоматически откроем по HTTPS/)).toBeInTheDocument();
    view.unmount();
  });

  it('заменяет transport-neutral session и очищает предыдущую', async () => {
    const editorDestroy = vi.spyOn(Editor.prototype, 'destroy');
    const firstDoc = new Y.Doc();
    const secondDoc = new Y.Doc();
    const firstDestroyed = vi.fn();
    const secondDestroyed = vi.fn();
    firstDoc.on('destroy', firstDestroyed);
    secondDoc.on('destroy', secondDestroyed);
    const firstSession = createInMemoryPageDocumentSession({
      doc: firstDoc,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });
    const secondSession = createInMemoryPageDocumentSession({
      doc: secondDoc,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });
    const view = render(<PageEditor session={firstSession} />);
    await screen.findByRole('textbox', { name: 'Содержимое страницы' });

    view.rerender(<PageEditor session={secondSession} />);

    await waitFor(() => expect(firstDestroyed).toHaveBeenCalledOnce());
    expect(editorDestroy).toHaveBeenCalled();
    expect(secondDestroyed).not.toHaveBeenCalled();

    view.unmount();
    expect(secondDestroyed).toHaveBeenCalledOnce();
  });

  it('принимает fake future transport через тот же minimal contract', async () => {
    const doc = new Y.Doc();
    const destroy = vi.fn(() => doc.destroy());
    const futureTransportSession = {
      doc,
      editable: true,
      status: 'ready',
      destroy,
      connectionState: 'synced',
    } as const satisfies PageDocumentSession & { connectionState: 'synced' };

    const view = render(<PageEditor session={futureTransportSession} />);

    expect(await screen.findByRole('textbox', { name: 'Содержимое страницы' })).toBeInTheDocument();
    expect(screen.queryByText('synced')).toBeNull();

    view.unmount();
    expect(destroy).toHaveBeenCalledOnce();
  });
});
