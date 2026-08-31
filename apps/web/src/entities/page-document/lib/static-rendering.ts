import type { JSONContent } from '@tiptap/core';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';

import { createPageDocumentSchemaExtensions } from '../model/editor-schema';

export function renderPageDocumentToHTML(content: JSONContent): string {
  return renderToHTMLString({
    content,
    extensions: createPageDocumentSchemaExtensions(),
  });
}
