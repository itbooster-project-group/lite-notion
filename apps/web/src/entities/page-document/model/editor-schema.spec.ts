import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { renderPageDocumentToHTML } from '../lib/static-rendering';
import {
  createPageDocumentEditorExtensions,
  createPageDocumentSchemaExtensions,
} from './editor-schema';
import { PAGE_CONTENT_YJS_FIELD, PAGE_DOCUMENT_SCHEMA_VERSION } from './schema-version';

const NODE_ID = '11111111-1111-4111-8111-111111111111';
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

function createEditor() {
  const document = new Y.Doc();
  const editor = new Editor({ extensions: createPageDocumentEditorExtensions(document) });
  documents.push(document);
  editors.push(editor);
  return { document, editor };
}

describe('page document schema version 1', () => {
  it('экспортирует стабильные schema version и collaboration field', () => {
    expect(PAGE_DOCUMENT_SCHEMA_VERSION).toBe(1);
    expect(PAGE_CONTENT_YJS_FIELD).toBe('default');
  });

  it('содержит только утверждённые nodes и marks', () => {
    const { editor } = createEditor();

    expect(Object.keys(editor.schema.nodes).sort()).toEqual([
      'bulletList',
      'doc',
      'hardBreak',
      'heading',
      'image',
      'listItem',
      'orderedList',
      'paragraph',
      'taskItem',
      'taskList',
      'text',
      'video',
      'youtube',
    ]);
    expect(Object.keys(editor.schema.marks).sort()).toEqual([
      'bold',
      'code',
      'italic',
      'link',
      'strike',
    ]);
  });

  it('ограничивает headings уровнями 1–3 и допускает nested task items', () => {
    const { editor } = createEditor();
    expect(editor.commands.setHeading({ level: 1 })).toBe(true);
    expect(editor.commands.setHeading({ level: 3 })).toBe(true);
    expect(editor.commands.setHeading({ level: 4 })).toBe(false);

    const nestedTasks = editor.schema.nodeFromJSON({
      content: [
        {
          content: [
            {
              attrs: { checked: false },
              content: [
                { content: [{ text: 'Родитель', type: 'text' }], type: 'paragraph' },
                {
                  content: [
                    {
                      attrs: { checked: true },
                      content: [
                        { content: [{ text: 'Вложенная', type: 'text' }], type: 'paragraph' },
                      ],
                      type: 'taskItem',
                    },
                  ],
                  type: 'taskList',
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

    expect(nestedTasks.check()).toBeUndefined();
  });

  it('использует collaboration history без StarterKit undoRedo', () => {
    const { editor } = createEditor();
    const extensionNames = editor.extensionManager.extensions.map(({ name }) => name);

    expect(extensionNames).toContain('collaboration');
    expect(extensionNames).not.toContain('undoRedo');
    expect(editor.commands.undo).toBeTypeOf('function');
    expect(editor.commands.redo).toBeTypeOf('function');
  });

  it('хранит только href link mark и генерирует safe output attrs', () => {
    const { editor } = createEditor();
    editor.commands.setContent('<p>Документация</p>');
    editor.commands.selectAll();

    expect(editor.commands.setLink({ href: 'javascript:alert(1)' })).toBe(false);
    expect(editor.commands.setLink({ href: 'https://example.com/docs' })).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual([
      { attrs: { href: 'https://example.com/docs' }, type: 'link' },
    ]);
    expect(editor.getHTML()).toContain('rel="noopener noreferrer"');
    expect(editor.getHTML()).toContain('target="_blank"');
  });

  it('статически рендерит custom media deterministic и без React NodeView', () => {
    const content: JSONContent = {
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
        {
          attrs: {
            alignment: 'center',
            caption: null,
            nodeId: NODE_ID,
            videoId: 'dQw4w9WgXcQ',
            widthPercent: 80,
          },
          type: 'youtube',
        },
        {
          attrs: {
            alignment: 'end',
            caption: 'Демо',
            nodeId: NODE_ID,
            src: 'https://example.com/demo.webm',
            widthPercent: 50,
          },
          type: 'video',
        },
      ],
      type: 'doc',
    };

    const first = renderPageDocumentToHTML(content);
    const second = renderPageDocumentToHTML(content);

    expect(second).toBe(first);
    expect(first).toContain(`data-node-id="${NODE_ID}"`);
    expect(first).toContain('style="width:60%"');
    expect(first).toContain('alt="Горы"');
    expect(first).toContain('referrerpolicy="no-referrer"');
    expect(first).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(first).toContain('title="YouTube video"');
    expect(first).toContain('src="https://example.com/demo.webm"');
    expect(first).toContain('<figcaption>Демо</figcaption>');
    expect(first).toContain('controls');
    expect(first).not.toContain('<script');
  });

  it('schema extensions для static renderer не содержат collaboration transport', () => {
    expect(createPageDocumentSchemaExtensions().map(({ name }) => name)).not.toContain(
      'collaboration',
    );
  });
});
