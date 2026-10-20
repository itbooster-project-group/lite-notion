import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicPublicationDto } from '@/shared/api';
import { loadPublicPublication } from './public-publication';

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = originalApiUrl;
  vi.restoreAllMocks();
});

function publication(): PublicPublicationDto {
  return {
    title: 'Snapshot title',
    seoTitle: 'Public title',
    seoDescription: 'Public description',
    schemaVersion: 2,
    contentJson: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Snapshot body' }] }],
    },
    assets: [],
    cover: null,
  };
}

describe('public SSR publication loader', () => {
  it('uses anonymous no-store fetch against configured API origin and validates the DTO', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test';
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(publication()),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await loadPublicPublication('public-page');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://api.example.test/api/v1/public/publications/public-page');
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(result?.dto.title).toBe('Snapshot title');
  });

  it('maps only backend 404 to not found and leaves temporary failures as server errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    await expect(loadPublicPublication('missing-page')).resolves.toBeNull();

    globalThis.fetch = vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch;
    await expect(loadPublicPublication('backend-down')).rejects.toBeInstanceOf(Error);
  });

  it('treats incomplete DTOs and unsafe resolver paths as not found', async () => {
    const invalid = publication() as PublicPublicationDto;
    (invalid as unknown as { assets: unknown[] }).assets = [
      {
        assetId: '8be3ed8b-62b7-4e82-90b2-41cab8000001',
        mimeType: 'image/png',
        width: null,
        height: null,
        resolverPath: '/api/v1/private/assets/secret',
      },
    ];
    globalThis.fetch = vi.fn(async () => Response.json(invalid)) as typeof fetch;
    await expect(loadPublicPublication('public-page')).resolves.toBeNull();
  });
});
