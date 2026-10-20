import type { JSONContent } from '@tiptap/core';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import {
  createPageDocumentSchemaExtensions,
  isSupportedPageDocumentSchemaVersion,
  normalizePageDocumentForStaticRendering,
} from '@/entities/page-document';
import { PublicationImage } from './publication-image';

export class UnsupportedPublicDocumentSchemaError extends Error {
  override readonly name = 'UnsupportedPublicDocumentSchemaError';
}

export function renderPublicPageDocument({
  assetUrls,
  content,
  schemaVersion,
}: Readonly<{
  assetUrls: Readonly<Record<string, string>>;
  content: JSONContent;
  schemaVersion: unknown;
}>): ReactNode {
  if (!isSupportedPageDocumentSchemaVersion(schemaVersion)) {
    throw new UnsupportedPublicDocumentSchemaError();
  }

  const normalized = normalizePageDocumentForStaticRendering(content, assetUrls);
  return renderToReactElement({
    content: normalized,
    extensions: createPageDocumentSchemaExtensions(),
    options: {
      nodeMapping: {
        taskItem: ({ node, children }) => {
          const checked = node.attrs.checked === true;
          return createElement(
            'li',
            { 'data-checked': String(checked), 'data-type': 'taskItem' },
            createElement(
              'label',
              null,
              createElement('input', { checked, disabled: true, readOnly: true, type: 'checkbox' }),
              createElement('span'),
            ),
            createElement('div', null, children),
          );
        },
        youtube: ({ node }) => {
          const attrs = node.attrs;
          const alignment =
            attrs.alignment === 'start' || attrs.alignment === 'end' ? attrs.alignment : 'center';
          const width = typeof attrs.widthPercent === 'number' ? attrs.widthPercent : 100;
          const caption = typeof attrs.caption === 'string' ? attrs.caption : '';
          const videoId = typeof attrs.videoId === 'string' ? attrs.videoId : '';
          return createElement(
            'figure',
            {
              'data-alignment': alignment,
              'data-page-document-node': 'youtube',
              'data-width-percent': String(width),
              style: {
                width: `${width}%`,
                marginInlineStart:
                  alignment === 'end' ? 'auto' : alignment === 'center' ? 'auto' : 0,
                marginInlineEnd:
                  alignment === 'start' ? 'auto' : alignment === 'center' ? 'auto' : 0,
              },
            },
            createElement('iframe', {
              allow:
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
              allowFullScreen: true,
              loading: 'lazy',
              referrerPolicy: 'no-referrer',
              src: `https://www.youtube-nocookie.com/embed/${videoId}`,
              title: caption || 'YouTube video',
            }),
            caption ? createElement('figcaption', null, caption) : null,
          );
        },
        image: ({ node }) => {
          const attrs = node.attrs;
          const alignment =
            attrs.alignment === 'start' || attrs.alignment === 'end' ? attrs.alignment : 'center';
          const width = typeof attrs.widthPercent === 'number' ? attrs.widthPercent : 100;
          const src = typeof attrs.src === 'string' ? attrs.src : undefined;
          return createElement(
            'figure',
            {
              'data-alignment': alignment,
              'data-decorative': attrs.decorative === true ? 'true' : 'false',
              'data-page-document-node': 'image',
              'data-width-percent': String(width),
              style: {
                width: `${width}%`,
                marginInlineStart:
                  alignment === 'end' ? 'auto' : alignment === 'center' ? 'auto' : 0,
                marginInlineEnd:
                  alignment === 'start' ? 'auto' : alignment === 'center' ? 'auto' : 0,
              },
            },
            src
              ? createElement(PublicationImage, {
                  alt:
                    attrs.decorative === true ? '' : typeof attrs.alt === 'string' ? attrs.alt : '',
                  src,
                })
              : createElement(
                  'span',
                  {
                    'data-asset-unavailable':
                      attrs.source && typeof attrs.source === 'object' && 'assetId' in attrs.source
                        ? attrs.source.assetId
                        : '',
                    role: 'img',
                  },
                  'Изображение недоступно',
                ),
            typeof attrs.caption === 'string' && attrs.caption
              ? createElement('figcaption', null, attrs.caption)
              : null,
          );
        },
      },
      unhandledMark: ({ children }) => children ?? null,
      unhandledNode: () => null,
    },
  });
}
