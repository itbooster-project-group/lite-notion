import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderPublicPageDocument } from './public-page-document';

const assetId = '8be3ed8b-62b7-4e82-90b2-41cab8000001';
const nodeId = '8be3ed8b-62b7-4e82-90b2-41cab8000002';

describe('public TipTap renderer', () => {
  it('renders schema v2 text, marks, lists, links, media, and safe unknown-node fallback', () => {
    const html = renderToStaticMarkup(
      renderPublicPageDocument({
        schemaVersion: 2,
        assetUrls: {
          [assetId]: 'https://api.example.test/api/v1/public/publications/page/assets/example',
        },
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Hello', marks: [{ type: 'bold' }] }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'link',
                  marks: [{ type: 'link', attrs: { href: 'https://example.test' } }],
                },
              ],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'before' },
                { type: 'hardBreak' },
                { type: 'text', text: 'after' },
              ],
            },
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: true },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'task' }] }],
                },
              ],
            },
            {
              type: 'youtube',
              attrs: { nodeId: '8be3ed8b-62b7-4e82-90b2-41cab8000003', videoId: 'dQw4w9WgXcQ' },
            },
            {
              type: 'video',
              attrs: {
                nodeId: '8be3ed8b-62b7-4e82-90b2-41cab8000004',
                src: 'https://media.example.test/video.mp4',
              },
            },
            {
              type: 'image',
              attrs: {
                nodeId,
                source: { type: 'asset', assetId },
                alt: 'Cover',
                decorative: false,
                widthPercent: 100,
              },
            },
            { type: 'unknownNode', content: [{ type: 'text', text: 'unsupported' }] },
          ],
        },
      }),
    );

    expect(html).toContain('<h2><strong>Hello</strong></h2>');
    expect(html).toContain('<a href="https://example.test/"');
    expect(html).toContain('>link</a>');
    expect(html).toContain('<ul><li><p>item</p></li></ul>');
    expect(html).toContain('before<br/>after');
    expect(html).toContain('task');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html).toContain('https://media.example.test/video.mp4');
    expect(html).toContain(
      'src="https://api.example.test/api/v1/public/publications/page/assets/example"',
    );
    expect(html).not.toContain('unsupported');
  });

  it('rejects unsupported schema versions and emits a placeholder for a missing descriptor', () => {
    expect(() =>
      renderPublicPageDocument({
        schemaVersion: 99,
        content: { type: 'doc', content: [] },
        assetUrls: {},
      }),
    ).toThrow();

    const html = renderToStaticMarkup(
      renderPublicPageDocument({
        schemaVersion: 2,
        assetUrls: {},
        content: {
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: {
                nodeId,
                source: { type: 'asset', assetId },
                src: 'https://stale.example/private.png',
                alt: 'Missing image',
                decorative: false,
              },
            },
          ],
        },
      }),
    );
    expect(html).toContain('Изображение недоступно');
    expect(html).not.toContain('stale.example');
  });
});
