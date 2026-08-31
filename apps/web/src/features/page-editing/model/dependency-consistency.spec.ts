import { Editor as CoreEditor } from '@tiptap/core';
import { Editor as ReactEditor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { PAGE_CONTENT_YJS_FIELD } from '@/entities/page-document';

describe('editor dependency runtime identity', () => {
  it('uses a single TipTap Editor constructor across core and React bindings', () => {
    expect(ReactEditor).toBe(CoreEditor);
  });

  it('accepts the canonical Yjs content fragment in y-prosemirror', () => {
    const document = new Y.Doc();
    const fragment = document.getXmlFragment(PAGE_CONTENT_YJS_FIELD);

    expect(ySyncPlugin(fragment).spec.key).toBeDefined();

    document.destroy();
  });
});
