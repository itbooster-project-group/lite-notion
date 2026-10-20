import type { JSONContent } from '@tiptap/core';
import { cache } from 'react';
import { isValidPageDocumentForStaticRendering } from '@/entities/page-document/lib/static-rendering';
import { isSupportedPageDocumentSchemaVersion } from '@/entities/page-document/model/schema-version';
import type { PublicAssetDescriptorDto, PublicPublicationDto } from '@/shared/api';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class PublicPublicationUnavailableError extends Error {
  override readonly name = 'PublicPublicationUnavailableError';
}

export type LoadedPublicPublication = Readonly<{
  dto: PublicPublicationDto;
  content: JSONContent;
  assetUrls: Readonly<Record<string, string>>;
  coverUrl?: string;
}>;

export const loadPublicPublication = cache(
  async (slug: string): Promise<LoadedPublicPublication | null> => {
    if (!SLUG_PATTERN.test(slug)) return null;

    const apiOrigin = getTrustedApiOrigin();
    const endpoint = new URL(`/api/v1/public/publications/${encodeURIComponent(slug)}`, apiOrigin);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        redirect: 'error',
      });
    } catch {
      throw new PublicPublicationUnavailableError();
    }

    if (response.status === 404) return null;
    if (!response.ok) throw new PublicPublicationUnavailableError();

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return null;
    }

    if (!isPublicPublicationDto(value, slug)) return null;
    const dto = value;
    const descriptors = [...dto.assets, ...(dto.cover ? [dto.cover] : [])];
    const assetUrls = Object.fromEntries(
      descriptors.map((asset) => [
        asset.assetId,
        new URL(asset.resolverPath, apiOrigin).toString(),
      ]),
    );
    if (!isValidPageDocumentForStaticRendering(dto.contentJson as JSONContent, assetUrls))
      return null;
    const coverUrl = dto.cover ? assetUrls[dto.cover.assetId] : undefined;

    return {
      assetUrls,
      content: dto.contentJson as JSONContent,
      ...(coverUrl ? { coverUrl } : {}),
      dto,
    };
  },
);

export function isPublicPublicationDto(
  value: unknown,
  slug: string,
): value is PublicPublicationDto {
  if (!isRecord(value)) return false;
  if (
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    typeof value.seoTitle !== 'string' ||
    (value.seoDescription !== null && typeof value.seoDescription !== 'string') ||
    !isSupportedPageDocumentSchemaVersion(value.schemaVersion) ||
    !isDocumentContent(value.contentJson) ||
    !Array.isArray(value.assets)
  ) {
    return false;
  }

  if (!value.assets.every((asset) => isPublicAssetDescriptor(asset, slug))) return false;
  return value.cover === null || isPublicAssetDescriptor(value.cover, slug);
}

function isPublicAssetDescriptor(value: unknown, slug: string): value is PublicAssetDescriptorDto {
  if (!isRecord(value)) return false;
  if (
    typeof value.assetId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.assetId,
    ) ||
    typeof value.mimeType !== 'string' ||
    !value.mimeType.startsWith('image/') ||
    (value.width !== null && typeof value.width !== 'number') ||
    (value.height !== null && typeof value.height !== 'number') ||
    typeof value.resolverPath !== 'string'
  ) {
    return false;
  }

  const expectedPath = `/api/v1/public/publications/${slug}/assets/${value.assetId}`;
  return value.resolverPath === expectedPath;
}

function isDocumentContent(value: unknown): value is JSONContent {
  return isRecord(value) && value.type === 'doc' && Array.isArray(value.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTrustedApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) throw new PublicPublicationUnavailableError();

  try {
    const url = new URL(configured);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid API origin');
    }
    return url.origin;
  } catch {
    throw new PublicPublicationUnavailableError();
  }
}
