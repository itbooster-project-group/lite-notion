import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

import {
  PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
  PAGE_DOCUMENT_REFERRER_POLICY,
  PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
} from './page-document-security-headers';

describe('page document security headers', () => {
  it('задаёт CSP только для разрешённых external media origins', () => {
    expect(PAGE_DOCUMENT_CONTENT_SECURITY_POLICY).toBe(
      "img-src 'self' https:; media-src 'self' https:; frame-src https://www.youtube-nocookie.com; object-src 'none'",
    );
  });

  it('не раскрывает полный referrer для external media', () => {
    expect(PAGE_DOCUMENT_REFERRER_POLICY).toBe('strict-origin-when-cross-origin');
  });

  it('применяет page-document policy только к document routes', async () => {
    expect(PAGE_DOCUMENT_SECURITY_HEADER_SOURCE).toBe('/pages/:path*');
    expect(PAGE_DOCUMENT_SECURITY_HEADER_SOURCE).not.toBe('/:path*');

    const configuredHeaders = await nextConfig.headers?.();
    expect(configuredHeaders?.map(({ source }) => source)).toEqual([
      PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
    ]);
  });
});
