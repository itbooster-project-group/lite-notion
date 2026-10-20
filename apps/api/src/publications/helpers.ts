import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentCaptureUnavailableError } from '../document-capture/errors/document-capture-unavailable.error';
import { DocumentProjectionError } from '../document-projection/document-projection.errors';
import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import {
  PublicationAssetUnavailableError,
  PublicationNotFoundError,
  PublicationSlugConflictError,
  PublicationStateConflictError,
} from './publication-errors';

const RESERVED_SLUGS = new Set(['api', 'login', 'register', 'profile', 'trash', 'projects']);

export function normalizePublicationSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (
    slug.length === 0 ||
    slug.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    RESERVED_SLUGS.has(slug)
  ) {
    throw new BadRequestException('Invalid publication slug');
  }
  return slug;
}

export function publicationPath(slug: string): string {
  return `/p/${slug}`;
}

export function resolverPath(slug: string, assetId: string): string {
  return `/api/v1/public/publications/${slug}/assets/${assetId}`;
}

export function toPublicationHttpException(error: unknown): never {
  if (error instanceof PublicationNotFoundError) {
    throw new NotFoundException('publication_not_found');
  }
  if (error instanceof PageNotFoundError) {
    throw new NotFoundException(error.message);
  }
  if (
    error instanceof PublicationStateConflictError ||
    error instanceof PublicationSlugConflictError
  ) {
    throw new ConflictException(
      error instanceof PublicationSlugConflictError
        ? 'publication_slug_conflict'
        : 'publication_state_conflict',
    );
  }
  if (error instanceof PublicationAssetUnavailableError) {
    throw new ConflictException('publication_asset_unavailable');
  }
  if (error instanceof DocumentCaptureUnavailableError) {
    throw new ServiceUnavailableException('document_capture_unavailable');
  }
  if (error instanceof DocumentProjectionError) {
    throw new UnprocessableEntityException(`document_${error.code}`);
  }
  if (error instanceof PageRoleInsufficientError) {
    throw new ForbiddenException(error.message);
  }
  throw error;
}
