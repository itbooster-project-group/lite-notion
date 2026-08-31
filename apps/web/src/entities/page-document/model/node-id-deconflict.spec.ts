import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createPageDocumentEditorExtensions } from './editor-schema';

const NODE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_NODE_ID = '22222222-2222-4222-8222-222222222222';

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

afterEach(() => {
  for (const editor of editors) editor.destroy();
  for (const document of documents) document.destroy();
  editors.length = 0;
  documents.length = 0;
});

function createEditor(content: Parameters<Editor['commands']['setContent']>[0]): Editor {
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  editor.commands.setContent(content);
  editors.push(editor);
  documents.push(document);
  return editor;
}

function imageHtml({
  alt,
  caption,
  nodeId,
  src,
}: Readonly<{ alt: string; caption: string; nodeId: string; src: string }>): string {
  return `<figure data-alignment="start" data-decorative="false" data-node-id="${nodeId}" data-page-document-node="image" data-width-percent="60"><img alt="${alt}" src="${src}"><figcaption>${caption}</figcaption></figure>`;
}

function pasteHtml(editor: Editor, html: string) {
  editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
}

function copySelectionAsHtml(editor: Editor): string {
  const clipboard = editor.view.serializeForClipboard(editor.state.selection.content());
  const container = document.createElement('div');
  container.append(clipboard.dom);
  return container.innerHTML;
}

describe('page document clipboard node ID deconflict', () => {
  it('меняет ID скопированного media node через настоящий clipboard pipeline', () => {
    const editor = createEditor({
      content: [
        {
          attrs: {
            alignment: 'start',
            alt: 'Горы',
            caption: 'Поход',
            decorative: false,
            nodeId: NODE_ID,
            src: 'https://example.com/mountains.jpg',
            widthPercent: 60,
          },
          type: 'image',
        },
        { type: 'paragraph' },
      ],
      type: 'doc',
    });
    editor.commands.setNodeSelection(0);
    const copiedHtml = copySelectionAsHtml(editor);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);

    pasteHtml(editor, copiedHtml);

    const images = editor.getJSON().content?.filter(({ type }) => type === 'image') ?? [];
    expect(images).toHaveLength(2);
    expect(images[0]?.attrs?.nodeId).toBe(NODE_ID);
    expect(images[1]?.attrs?.nodeId).not.toBe(NODE_ID);
    expect(images[1]).toMatchObject({
      attrs: {
        alignment: 'start',
        alt: 'Горы',
        caption: 'Поход',
        decorative: false,
        src: 'https://example.com/mountains.jpg',
        widthPercent: 60,
      },
      type: 'image',
    });
  });

  it('устраняет конфликты между media nodes одного clipboard slice', () => {
    const editor = createEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
    editor.commands.setTextSelection(1);

    pasteHtml(
      editor,
      [
        imageHtml({
          alt: 'Первая',
          caption: 'Один',
          nodeId: SECOND_NODE_ID,
          src: 'https://example.com/first.jpg',
        }),
        imageHtml({
          alt: 'Вторая',
          caption: 'Два',
          nodeId: SECOND_NODE_ID,
          src: 'https://example.com/second.jpg',
        }),
      ].join(''),
    );

    const images = editor.getJSON().content?.filter(({ type }) => type === 'image') ?? [];
    const nodeIds = images.map((node) => node.attrs?.nodeId);
    expect(images).toHaveLength(2);
    expect(nodeIds).toContain(SECOND_NODE_ID);
    expect(new Set(nodeIds)).toHaveLength(2);
    expect(images.map((node) => node.attrs?.src)).toEqual([
      'https://example.com/first.jpg',
      'https://example.com/second.jpg',
    ]);
  });
});
