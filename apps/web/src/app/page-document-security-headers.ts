export const PAGE_DOCUMENT_CONTENT_SECURITY_POLICY = [
  "img-src 'self' https:",
  "media-src 'self' https:",
  'frame-src https://www.youtube-nocookie.com',
  "object-src 'none'",
].join('; ');

export const PAGE_DOCUMENT_REFERRER_POLICY = 'strict-origin-when-cross-origin';
