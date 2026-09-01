import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { normalizePageDocumentForRendering, renderPageDocumentToHTML } from './static-rendering';

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
    const html = renderPageDocumentToHTML(untrustedContent);

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
    });

    expect(html).not.toContain('<figure');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<video');
  });
});
