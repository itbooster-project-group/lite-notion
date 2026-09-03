import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';

import {
  filterPageEditorSlashCommands,
  getPageEditorSlashQuery,
  runPageEditorSlashCommand,
} from './slash-menu';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor(content: string): Editor {
  const doc = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
  editor.commands.setContent(`<p>${content}</p>`);
  editor.commands.setTextSelection(content.length + 1);
  documents.push(doc);
  editors.push(editor);
  return editor;
}

describe('page editor slash menu', () => {
  it('находит slash query в текущем text selection', () => {
    const editor = createEditor('Текст /заг');

    expect(getPageEditorSlashQuery(editor)).toEqual({ from: 7, query: 'заг', to: 11 });
    expect(filterPageEditorSlashCommands('заг')).toMatchObject([
      { id: 'heading-1' },
      { id: 'heading-2' },
      { id: 'heading-3' },
    ]);
    expect(filterPageEditorSlashCommands('ссыл')).toMatchObject([
      { id: 'link', opensLinkForm: true },
    ]);
  });

  it('удаляет query и применяет non-media command в одной editor transaction', () => {
    const editor = createEditor('/заг');
    const query = getPageEditorSlashQuery(editor);
    if (!query) throw new Error('Expected slash query.');

    expect(runPageEditorSlashCommand(editor, query, 'heading-2')).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      content: [{ attrs: { level: 2 }, type: 'heading' }],
    });
  });

  it('не открывает menu для whitespace-separated text без slash query', () => {
    const editor = createEditor('Текст команды');

    expect(getPageEditorSlashQuery(editor)).toBeUndefined();
  });
});
