import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

import {
  PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
  PAGE_DOCUMENT_REFERRER_POLICY,
  PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
  PUBLICATION_CONTENT_SECURITY_POLICY,
  PUBLICATION_SECURITY_HEADER_SOURCE,
} from './page-document-security-headers';

describe('page document security headers', () => {
  // За единым origin схемы всё равно две: http: и ws: — разные источники для CSP.
  it('разрешает HTTP и WebSocket через origin шлюза', () => {
    expect(PAGE_DOCUMENT_CONTENT_SECURITY_POLICY).toBe(
      "connect-src 'self' http://localhost:8080 ws://localhost:8080; img-src 'self' https:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; object-src 'none'",
    );
  });

  it('не раскрывает полный referrer для external media', () => {
    expect(PAGE_DOCUMENT_REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
  });

  it('разрешает только настроенный HTTP API origin для resolver и HTTPS storage redirect', () => {
    expect(PUBLICATION_CONTENT_SECURITY_POLICY).toBe(
      "img-src 'self' https: http://localhost:8080; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; object-src 'none'",
    );
    expect(PUBLICATION_SECURITY_HEADER_SOURCE).toBe('/p/:path*');
  });

  it('применяет page-document policy только к document routes', async () => {
    expect(PAGE_DOCUMENT_SECURITY_HEADER_SOURCE).toBe('/pages/:path*');
    expect(PAGE_DOCUMENT_SECURITY_HEADER_SOURCE).not.toBe('/:path*');

    const configuredHeaders = await nextConfig.headers?.();
    expect(configuredHeaders?.map(({ source }) => source)).toEqual([
      PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
      PUBLICATION_SECURITY_HEADER_SOURCE,
    ]);
    expect(configuredHeaders?.[1]?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'private, no-store, max-age=0',
    });
  });
});
