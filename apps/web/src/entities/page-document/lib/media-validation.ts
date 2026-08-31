export const PAGE_DOCUMENT_MEDIA_ALIGNMENTS = ['start', 'center', 'end'] as const;
export const PAGE_DOCUMENT_MIN_WIDTH_PERCENT = 25;
export const PAGE_DOCUMENT_MAX_WIDTH_PERCENT = 100;

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PageDocumentMediaAlignment = (typeof PAGE_DOCUMENT_MEDIA_ALIGNMENTS)[number];

export type PageDocumentImageAttributes = Readonly<{
  alignment: PageDocumentMediaAlignment;
  alt: string;
  caption: string | null;
  decorative: boolean;
  nodeId: string;
  src: string;
  widthPercent: number;
}>;

export type PageDocumentYoutubeAttributes = Readonly<{
  alignment: PageDocumentMediaAlignment;
  caption: string | null;
  nodeId: string;
  videoId: string;
  widthPercent: number;
}>;

export type PageDocumentVideoAttributes = Readonly<{
  alignment: PageDocumentMediaAlignment;
  caption: string | null;
  nodeId: string;
  src: string;
  widthPercent: number;
}>;

type MediaPresentationInput = Readonly<{
  alignment?: PageDocumentMediaAlignment;
  caption?: string | null;
  widthPercent?: number;
}>;

type NodeIdFactory = () => string;

function normalizeHttpsUrl(value: string): URL | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue);
  const candidate = hasProtocol ? trimmedValue : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);

    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return undefined;
    }

    return url;
  } catch {
    return undefined;
  }
}

function normalizeCaption(value: string | null | undefined): string | null {
  const caption = value?.trim();
  return caption ? caption : null;
}

function normalizeAlignment(
  value: PageDocumentMediaAlignment | undefined,
): PageDocumentMediaAlignment {
  return value && PAGE_DOCUMENT_MEDIA_ALIGNMENTS.includes(value) ? value : 'center';
}

function createPresentationAttributes(input: MediaPresentationInput) {
  return {
    alignment: normalizeAlignment(input.alignment),
    caption: normalizeCaption(input.caption),
    widthPercent: clampPageDocumentWidthPercent(
      input.widthPercent ?? PAGE_DOCUMENT_MAX_WIDTH_PERCENT,
    ),
  };
}

export function createPageDocumentNodeId(): string {
  return globalThis.crypto.randomUUID();
}

export function isPageDocumentNodeId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function clampPageDocumentWidthPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return PAGE_DOCUMENT_MAX_WIDTH_PERCENT;
  }

  return Math.min(
    PAGE_DOCUMENT_MAX_WIDTH_PERCENT,
    Math.max(PAGE_DOCUMENT_MIN_WIDTH_PERCENT, Math.round(value)),
  );
}

export function normalizePageDocumentLink(value: string): string | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue);
  const candidate = hasProtocol ? trimmedValue : `https://${trimmedValue}`;

  try {
    const url = new URL(candidate);

    if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) {
      return undefined;
    }

    if (url.protocol === 'mailto:') {
      return url.pathname ? url.href : undefined;
    }

    return url.hostname ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function normalizePageDocumentImageUrl(value: string): string | undefined {
  return normalizeHttpsUrl(value)?.href;
}

export function normalizePageDocumentVideoUrl(value: string): string | undefined {
  const url = normalizeHttpsUrl(value);

  if (!url || !/\.(mp4|webm)$/i.test(url.pathname)) {
    return undefined;
  }

  return url.href;
}

export function normalizePageDocumentYoutubeVideoId(value: string): string | undefined {
  const url = normalizeHttpsUrl(value);

  if (!url || !ALLOWED_YOUTUBE_HOSTS.has(url.hostname)) {
    return undefined;
  }

  let videoId: string | null | undefined;

  if (url.hostname === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v');
  } else {
    const [prefix, id] = url.pathname.split('/').filter(Boolean);
    videoId = prefix === 'embed' || prefix === 'shorts' ? id : undefined;
  }

  return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : undefined;
}

export function createPageDocumentImageAttributes(
  input: MediaPresentationInput &
    Readonly<{
      alt: string;
      decorative: boolean;
      src: string;
    }>,
  nodeIdFactory: NodeIdFactory = createPageDocumentNodeId,
): PageDocumentImageAttributes | undefined {
  const src = normalizePageDocumentImageUrl(input.src);
  const alt = input.alt.trim();

  if (!src || (input.decorative ? alt.length > 0 : alt.length === 0)) {
    return undefined;
  }

  return {
    ...createPresentationAttributes(input),
    alt,
    decorative: input.decorative,
    nodeId: nodeIdFactory(),
    src,
  };
}

export function createPageDocumentYoutubeAttributes(
  input: MediaPresentationInput & Readonly<{ url: string }>,
  nodeIdFactory: NodeIdFactory = createPageDocumentNodeId,
): PageDocumentYoutubeAttributes | undefined {
  const videoId = normalizePageDocumentYoutubeVideoId(input.url);

  if (!videoId) {
    return undefined;
  }

  return {
    ...createPresentationAttributes(input),
    nodeId: nodeIdFactory(),
    videoId,
  };
}

export function createPageDocumentVideoAttributes(
  input: MediaPresentationInput & Readonly<{ src: string }>,
  nodeIdFactory: NodeIdFactory = createPageDocumentNodeId,
): PageDocumentVideoAttributes | undefined {
  const src = normalizePageDocumentVideoUrl(input.src);

  if (!src) {
    return undefined;
  }

  return {
    ...createPresentationAttributes(input),
    nodeId: nodeIdFactory(),
    src,
  };
}
