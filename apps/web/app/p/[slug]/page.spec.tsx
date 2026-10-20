import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicPublicationDto } from '@/shared/api';
import { generateMetadata } from './page';

const previousFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = previousFetch;
});

describe('public publication metadata', () => {
  it('uses only SEO fields and snapshot title returned by public API', async () => {
    const response: PublicPublicationDto = {
      title: 'Snapshot title',
      seoTitle: 'Public SEO title',
      seoDescription: 'Public SEO description',
      schemaVersion: 2,
      contentJson: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Snapshot body' }] }],
      },
      assets: [],
      cover: null,
    };
    globalThis.fetch = vi.fn(async () => Response.json(response)) as typeof fetch;

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'published-page' }),
    });

    expect(metadata.title).toBe('Public SEO title');
    expect(metadata.description).toBe('Public SEO description');
    expect(metadata.alternates?.canonical).toBeUndefined();
  });
});
