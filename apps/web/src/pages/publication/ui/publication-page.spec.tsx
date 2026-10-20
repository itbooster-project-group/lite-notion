import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LoadedPublicPublication } from '../model/public-publication';
import { PublicationPage } from './publication-page';

describe('PublicationPage', () => {
  it('renders snapshot title, public rendering, and snapshot cover from the public DTO', () => {
    const assetId = '8be3ed8b-62b7-4e82-90b2-41cab8000001';
    const publication: LoadedPublicPublication = {
      assetUrls: {
        [assetId]: `https://api.example.test/api/v1/public/publications/snapshot/assets/${assetId}`,
      },
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published body' }] }],
      },
      coverUrl: `https://api.example.test/api/v1/public/publications/snapshot/assets/${assetId}`,
      dto: {
        title: 'Snapshot heading',
        seoTitle: 'SEO heading',
        seoDescription: null,
        schemaVersion: 2,
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Published body' }] }],
        },
        assets: [],
        cover: {
          assetId,
          mimeType: 'image/png',
          width: 1200,
          height: 600,
          resolverPath: `/api/v1/public/publications/snapshot/assets/${assetId}`,
        },
      },
    };

    const html = renderToStaticMarkup(<PublicationPage publication={publication} />);
    expect(html).toContain('>Snapshot heading</h1>');
    expect(html).toContain('Published body');
    expect(html).toContain(`src="${publication.coverUrl}"`);
    expect(html).toContain('alt="Обложка страницы"');
  });
});
