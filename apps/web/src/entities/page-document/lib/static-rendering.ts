import type { JSONContent } from '@tiptap/core';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';

import {
  createPageDocumentSchemaExtensions,
  getPageDocumentSchema,
} from '../model/page-document-schema';
import { isSupportedPageDocumentSchemaVersion } from '../model/schema-version';
import {
  normalizePageDocumentImageUrl,
  normalizePageDocumentLink,
  normalizePersistedPageDocumentImageAttributes,
  normalizePersistedPageDocumentVideoAttributes,
  normalizePersistedPageDocumentYoutubeAttributes,
} from './media-validation';

export type PageDocumentStaticRenderingInput = Readonly<{
  content: JSONContent;
  schemaVersion: unknown;
  assetUrls?: Readonly<Record<string, string>>;
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

function normalizeNode(
  node: JSONContent,
  assetUrls: Readonly<Record<string, string>> = {},
): JSONContent | undefined {
  if (node.type === 'image') {
    const attrs = normalizePersistedPageDocumentImageAttributes(node.attrs);
    if (!attrs) return undefined;
    const resolvedUrl = attrs.source
      ? normalizePageDocumentImageUrl(assetUrls[attrs.source.assetId] ?? '')
      : undefined;
    return {
      attrs: {
        ...attrs,
        src: attrs.source ? (resolvedUrl ?? null) : attrs.src,
      },
      type: 'image',
    };
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
        const normalized = normalizeNode(child, assetUrls);
        return normalized ? [normalized] : [];
      })
    : undefined;

  return {
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(content?.length ? { content } : {}),
    type: node.type,
  };
}

export function normalizePageDocumentForStaticRendering(
  content: JSONContent,
  assetUrls?: Readonly<Record<string, string>>,
): JSONContent {
  if (content.type !== 'doc') return { type: 'doc' };

  return normalizeNode(content, assetUrls) ?? { type: 'doc' };
}

export function isValidPageDocumentForStaticRendering(
  content: JSONContent,
  assetUrls?: Readonly<Record<string, string>>,
): boolean {
  try {
    getPageDocumentSchema()
      .nodeFromJSON(normalizePageDocumentForStaticRendering(content, assetUrls))
      .check();
    return true;
  } catch {
    return false;
  }
}

export function renderPageDocumentToHTML({
  assetUrls,
  content,
  schemaVersion,
}: PageDocumentStaticRenderingInput): string {
  if (!isSupportedPageDocumentSchemaVersion(schemaVersion)) {
    throw new UnsupportedPageDocumentStaticRenderingSchemaError(schemaVersion);
  }

  return renderToHTMLString({
    content: normalizePageDocumentForStaticRendering(content, assetUrls),
    extensions: createPageDocumentSchemaExtensions(),
  });
}
