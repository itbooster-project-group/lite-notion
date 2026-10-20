import { afterEach, describe, expect, it } from 'vitest';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import { getPageDocumentSchema, PAGE_CONTENT_YJS_FIELD } from '@/entities/page-document';

import {
  decodePageDocumentState,
  encodePageDocumentState,
  getPageDocumentContentFragment,
  pageDocumentToJSON,
} from './yjs-state';

const documents: Y.Doc[] = [];

afterEach(() => {
  for (const document of documents) {
    document.destroy();
  }
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
    const schema = getPageDocumentSchema();
    const content = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Содержимое страницы' }] }],
    });
    prosemirrorToYXmlFragment(content, getPageDocumentContentFragment(source));
    documents.push(source);

    const restored = decodePageDocumentState(encodePageDocumentState(source));
    documents.push(restored);

    expect(restored.getXmlFragment(PAGE_CONTENT_YJS_FIELD).length).toBeGreaterThan(0);
    expect(restored.getXmlFragment('prosemirror').length).toBe(0);
    expect(pageDocumentToJSON(restored)).toEqual(content.toJSON());
  });

  it('отклоняет corrupted Yjs update', () => {
    expect(() => decodePageDocumentState(Uint8Array.from([255, 255, 255]))).toThrow();
  });
});
