import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { PAGE_DOCUMENT_SCHEMA_VERSION } from '../model/schema-version';
import {
  normalizePageDocumentForRendering,
  renderPageDocumentToHTML,
  UnsupportedPageDocumentStaticRenderingSchemaError,
} from './static-rendering';

const NODE_ID = '11111111-1111-4111-8111-111111111111';

describe('page document static rendering boundary', () => {
  it('нормализует persisted presentation attrs и link href до rendering', () => {
    const untrustedContent: JSONContent = {
      content: [
        {
          content: [
            {
              marks: [{ attrs: { href: 'javascript:alert(1)' }, type: 'link' }],
              text: 'unsafe',
              type: 'text',
            },
            {
              marks: [{ attrs: { href: 'example.com/docs' }, type: 'link' }],
              text: 'safe',
              type: 'text',
            },
          ],
          type: 'paragraph',
        },
        {
          attrs: {
            alignment: 'sideways',
            alt: 'Пейзаж',
            caption: '  Вид  ',
            decorative: false,
            nodeId: NODE_ID,
            src: 'https://example.com/image.jpg',
            widthPercent: 1000,
          },
          type: 'image',
        },
      ],
      type: 'doc',
    };

    const normalized = normalizePageDocumentForRendering(untrustedContent);
    const html = renderPageDocumentToHTML({
      content: untrustedContent,
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    expect(normalized.content?.[0]?.content).toEqual([
      { text: 'unsafe', type: 'text' },
      {
        marks: [{ attrs: { href: 'https://example.com/docs' }, type: 'link' }],
        text: 'safe',
        type: 'text',
      },
    ]);
    expect(normalized.content?.[1]?.attrs).toMatchObject({
      alignment: 'center',
      caption: 'Вид',
      widthPercent: 100,
    });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('style="width:100%;margin-inline-start:auto;margin-inline-end:auto"');
  });

  it('fail-safe удаляет media с небезопасными persisted attrs', () => {
    const html = renderPageDocumentToHTML({
      content: {
        content: [
          {
            attrs: {
              alignment: 'start',
              alt: 'X',
              decorative: false,
              nodeId: NODE_ID,
              src: 'javascript:alert(1)',
              widthPercent: 50,
            },
            type: 'image',
          },
          {
            attrs: {
              alignment: 'center',
              nodeId: NODE_ID,
              videoId: '../../tracking',
              widthPercent: 50,
            },
            type: 'youtube',
          },
          {
            attrs: {
              alignment: 'end',
              nodeId: 'not-a-uuid',
              src: 'https://example.com/video.mp4',
              widthPercent: 50,
            },
            type: 'video',
          },
        ],
        type: 'doc',
      },
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });

    expect(html).not.toContain('<figure');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
  });

  it('явно отклоняет неизвестную schemaVersion вместо частичного rendering', () => {
    expect(() =>
      renderPageDocumentToHTML({
        content: {
          content: [{ type: 'future-node' }],
          type: 'doc',
        },
        schemaVersion: 2,
      }),
    ).toThrow(UnsupportedPageDocumentStaticRenderingSchemaError);
  });

  it('открывает только HTTP(S) links в новой вкладке и fail-safe снимает unsafe mark', () => {
    const html = renderPageDocumentToHTML({
      content: {
        content: [
          {
            content: [
              {
                marks: [{ attrs: { href: 'https://example.com/docs' }, type: 'link' }],
                text: 'HTTPS',
                type: 'text',
              },
              { text: ' ', type: 'text' },
              {
                marks: [{ attrs: { href: 'mailto:editor@example.com' }, type: 'link' }],
                text: 'Email',
                type: 'text',
              },
              { text: ' ', type: 'text' },
              {
                marks: [{ attrs: { href: 'javascript:alert(1)' }, type: 'link' }],
                text: 'Unsafe',
                type: 'text',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      schemaVersion: PAGE_DOCUMENT_SCHEMA_VERSION,
    });
    const container = document.createElement('div');
    container.innerHTML = html;
    const [httpsLink, mailtoLink] = Array.from(container.querySelectorAll('a'));

    expect(httpsLink).toHaveAttribute('href', 'https://example.com/docs');
    expect(httpsLink).toHaveAttribute('target', '_blank');
    expect(httpsLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mailtoLink).toHaveAttribute('href', 'mailto:editor@example.com');
    expect(mailtoLink).not.toHaveAttribute('target');
    expect(mailtoLink).not.toHaveAttribute('rel');
    expect(container).toHaveTextContent('Unsafe');
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });
});
