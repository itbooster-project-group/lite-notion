import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  createPageDocumentEditorExtensions,
  getPageDocumentContentFragment,
  pageDocumentToJSON,
} from '@/entities/page-document';

import { insertPageDocumentContent } from './insert-page-document-content';

const NODE_ID = '11111111-1111-4111-8111-111111111111';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

describe('insert page document content', () => {
  it('вставляет clone media node с новым ID в текущий Y.Doc', () => {
    const doc = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    documents.push(doc);
    editors.push(editor);
    editor.commands.setContent({
      content: [
        {
          attrs: {
            alt: 'Горы',
            decorative: false,
            nodeId: NODE_ID,
            src: 'https://example.com/mountains.jpg',
          },
          type: 'image',
        },
      ],
      type: 'doc',
    });
    editor.commands.setTextSelection(1);

    expect(
      insertPageDocumentContent(editor, {
        attrs: {
          alt: 'Копия гор',
          decorative: false,
          nodeId: NODE_ID,
          src: 'https://example.com/mountains-copy.jpg',
        },
        type: 'image',
      }),
    ).toBe(true);

    const documentJson = pageDocumentToJSON(doc);
    const nodeIds = documentJson.content?.map((node) => node.attrs?.nodeId);
    expect(nodeIds).toHaveLength(2);
    expect(new Set(nodeIds)).toHaveLength(2);
    expect(getPageDocumentContentFragment(doc).length).toBeGreaterThan(0);
  });

  it('сохраняет nodeId при обычном обновлении attrs и перемещении media block', () => {
    const doc = new Y.Doc();
    const editor = new Editor({ extensions: createPageDocumentEditorExtensions(doc) });
    documents.push(doc);
    editors.push(editor);
    editor.commands.setContent({
      content: [
        { content: [{ text: 'До', type: 'text' }], type: 'paragraph' },
        {
          attrs: {
            alt: 'Горы',
            decorative: false,
            nodeId: NODE_ID,
            src: 'https://example.com/mountains.jpg',
          },
          type: 'image',
        },
        { content: [{ text: 'После', type: 'text' }], type: 'paragraph' },
      ],
      type: 'doc',
    });
    editor.commands.setNodeSelection(4);
    editor.commands.updateAttributes('image', { caption: 'Летний поход', widthPercent: 75 });

    const mediaNode = editor.state.doc.nodeAt(4);
    if (!mediaNode) throw new Error('Expected media node at the current selection.');

    editor.view.dispatch(editor.state.tr.delete(4, 4 + mediaNode.nodeSize).insert(0, mediaNode));

    expect(pageDocumentToJSON(doc).content?.[0]).toMatchObject({
      attrs: { caption: 'Летний поход', nodeId: NODE_ID, widthPercent: 75 },
      type: 'image',
    });
  });
});
