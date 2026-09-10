const configuredApiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL;
const configuredCollaborationOrigin = process.env.NEXT_PUBLIC_COLLABORATION_URL;

function cspOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

const connectSources = [
  "'self'",
  cspOrigin(configuredApiOrigin),
  cspOrigin(configuredCollaborationOrigin),
].filter((source): source is string => source !== undefined);

export const PAGE_DOCUMENT_CONTENT_SECURITY_POLICY = [
  `connect-src ${connectSources.join(' ')}`,
  "img-src 'self' https:",
  "media-src 'self' https:",
  'frame-src https://www.youtube-nocookie.com',
  "object-src 'none'",
].join('; ');

export const PAGE_DOCUMENT_REFERRER_POLICY = 'strict-origin-when-cross-origin';

export const PAGE_DOCUMENT_SECURITY_HEADER_SOURCE = '/pages/:path*';
