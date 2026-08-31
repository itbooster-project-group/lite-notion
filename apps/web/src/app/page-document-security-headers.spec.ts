import { describe, expect, it } from 'vitest';

import {
  PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
  PAGE_DOCUMENT_REFERRER_POLICY,
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
});
