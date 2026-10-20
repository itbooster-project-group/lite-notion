import {
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DocumentCaptureUnavailableError } from '../document-capture/errors/document-capture-unavailable.error';
import { DocumentProjectionError } from '../document-projection/document-projection.errors';
import { toPublicationHttpException } from './helpers';
import {
  PublicationAssetUnavailableError,
  PublicationNotFoundError,
  PublicationSlugConflictError,
  PublicationStateConflictError,
} from './publication-errors';

function mapped(error: unknown): HttpException {
  try {
    toPublicationHttpException(error);
  } catch (mappedError) {
    if (mappedError instanceof HttpException) return mappedError;
    throw mappedError;
  }
  throw new Error('Expected an HTTP exception');
}

describe('publication HTTP error mapping', () => {
  it('uses stable error messages for publication state, slug and missing publication', () => {
    expect(mapped(new PublicationNotFoundError())).toBeInstanceOf(NotFoundException);
    expect(mapped(new PublicationNotFoundError()).getResponse()).toMatchObject({
      message: 'publication_not_found',
      statusCode: 404,
    });
    expect(mapped(new PublicationSlugConflictError()).getResponse()).toMatchObject({
      message: 'publication_slug_conflict',
      statusCode: 409,
    });
    expect(mapped(new PublicationStateConflictError()).getResponse()).toMatchObject({
      message: 'publication_state_conflict',
      statusCode: 409,
    });
    expect(mapped(new PublicationAssetUnavailableError()).getResponse()).toMatchObject({
      message: 'publication_asset_unavailable',
      statusCode: 409,
    });
    expect(mapped(new PublicationStateConflictError()).getStatus()).toBe(409);
  });

  it('maps capture outages and schema-aware projection failures without exposing internals', () => {
    expect(mapped(new DocumentCaptureUnavailableError())).toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mapped(new DocumentCaptureUnavailableError()).getResponse()).toMatchObject({
      message: 'document_capture_unavailable',
      statusCode: 503,
    });
    const projection = mapped(
      new DocumentProjectionError('unsupported_schema_version', 'private implementation detail'),
    );
    expect(projection).toBeInstanceOf(UnprocessableEntityException);
    expect(projection.getResponse()).toMatchObject({
      message: 'document_unsupported_schema_version',
      statusCode: 422,
    });
    expect(projection.getStatus()).toBe(422);
  });
});
