import type { JSONContent } from '@tiptap/core';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';

import { createPageDocumentSchemaExtensions } from '../model/editor-schema';
import { isSupportedPageDocumentSchemaVersion } from '../model/schema-version';
import {
  normalizePageDocumentLink,
  normalizePersistedPageDocumentImageAttributes,
  normalizePersistedPageDocumentVideoAttributes,
  normalizePersistedPageDocumentYoutubeAttributes,
} from './media-validation';

export type PageDocumentStaticRenderingInput = Readonly<{
  content: JSONContent;
  schemaVersion: unknown;
}>;

export class UnsupportedPageDocumentStaticRenderingSchemaError extends Error {
  override readonly name = 'UnsupportedPageDocumentStaticRenderingSchemaError';

  constructor(readonly schemaVersion: unknown) {
    super('Static rendering не поддерживает версию схемы документа.');
  }
}

const RENDERABLE_NODE_TYPES = new Set([
  'bulletList',
  'doc',
  'hardBreak',
  'heading',
  'listItem',
  'orderedList',
  'paragraph',
  'taskItem',
  'taskList',
  'text',
]);
const RENDERABLE_MARK_TYPES = new Set(['bold', 'code', 'italic', 'strike']);

function normalizeMarks(marks: JSONContent['marks']): JSONContent['marks'] {
  if (!Array.isArray(marks)) return undefined;

  const normalized = marks.flatMap((mark) => {
    if (mark.type === 'link') {
      const href =
        typeof mark.attrs?.href === 'string'
          ? normalizePageDocumentLink(mark.attrs.href)
          : undefined;
      return href ? [{ attrs: { href }, type: 'link' }] : [];
    }

    return mark.type && RENDERABLE_MARK_TYPES.has(mark.type) ? [{ type: mark.type }] : [];
  });

  return normalized.length ? normalized : undefined;
}

function normalizeNode(node: JSONContent): JSONContent | undefined {
  if (node.type === 'image') {
    const attrs = normalizePersistedPageDocumentImageAttributes(node.attrs);
    return attrs ? { attrs, type: 'image' } : undefined;
  }
  if (node.type === 'youtube') {
    const attrs = normalizePersistedPageDocumentYoutubeAttributes(node.attrs);
    return attrs ? { attrs, type: 'youtube' } : undefined;
  }
  if (node.type === 'video') {
    const attrs = normalizePersistedPageDocumentVideoAttributes(node.attrs);
    return attrs ? { attrs, type: 'video' } : undefined;
  }
  if (!node.type || !RENDERABLE_NODE_TYPES.has(node.type)) return undefined;
  if (node.type === 'text') {
    if (typeof node.text !== 'string') return undefined;
    const marks = normalizeMarks(node.marks);
    return marks ? { marks, text: node.text, type: 'text' } : { text: node.text, type: 'text' };
  }

  const content = Array.isArray(node.content)
    ? node.content.flatMap((child) => {
        const normalized = normalizeNode(child);
        return normalized ? [normalized] : [];
      })
    : undefined;

  return {
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(content?.length ? { content } : {}),
    type: node.type,
  };
}

/**
 * Converts untrusted persisted/derived JSON into the schema-v1 subset that may
 * cross the immutable/static rendering boundary.
 */
export function normalizePageDocumentForRendering(content: JSONContent): JSONContent {
  if (content.type !== 'doc') return { type: 'doc' };

  return normalizeNode(content) ?? { type: 'doc' };
}

export function renderPageDocumentToHTML({
  content,
  schemaVersion,
}: PageDocumentStaticRenderingInput): string {
  if (!isSupportedPageDocumentSchemaVersion(schemaVersion)) {
    throw new UnsupportedPageDocumentStaticRenderingSchemaError(schemaVersion);
  }

  return renderToHTMLString({
    content: normalizePageDocumentForRendering(content),
    extensions: createPageDocumentSchemaExtensions(),
  });
}
