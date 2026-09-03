import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createPageDocumentEditorExtensions } from '../model/editor-schema';
import { PAGE_CONTENT_YJS_FIELD } from '../model/schema-version';
import {
  decodePageDocumentState,
  encodePageDocumentState,
  getPageDocumentContentFragment,
  pageDocumentToJSON,
} from './yjs-state';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) {
    editor.destroy();
  }
  for (const document of documents) {
    document.destroy();
  }
  editors.length = 0;
  documents.length = 0;
});

describe('page document Yjs state', () => {
  it('считает empty encoded Y.Doc валидным документом без materialized field', () => {
    const source = new Y.Doc();
    source.getXmlFragment(PAGE_CONTENT_YJS_FIELD);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(source));
    documents.push(source, restored);

    expect(getPageDocumentContentFragment(restored).length).toBe(0);
    expect(pageDocumentToJSON(restored)).toMatchObject({ type: 'doc' });
  });

  it('читает populated content из canonical field после round-trip', () => {
    const source = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(source) });
    documents.push(source);
    editors.push(editor);
    editor.commands.setContent('<p>Содержимое страницы</p>');

    const restored = decodePageDocumentState(encodePageDocumentState(source));
    documents.push(restored);

    expect(restored.getXmlFragment(PAGE_CONTENT_YJS_FIELD).length).toBeGreaterThan(0);
    expect(restored.getXmlFragment('prosemirror').length).toBe(0);
    expect(pageDocumentToJSON(restored)).toEqual(editor.getJSON());
  });

  it('отклоняет corrupted Yjs update', () => {
    expect(() => decodePageDocumentState(Uint8Array.from([255, 255, 255]))).toThrow();
  });
});
