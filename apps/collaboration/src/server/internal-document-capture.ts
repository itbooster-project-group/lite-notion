import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Hocuspocus } from '@hocuspocus/server';

import {
  ApiDeniedError,
  ApiUnavailableError,
  type InternalApiClient,
} from '../api/internal-api-client.js';
import type { CollaborationConfig } from '../config/environment.js';
import { DocumentCapture, DocumentCaptureEncodingError } from '../documents/document-capture.js';
import { parsePageDocumentName } from '../documents/document-name.js';
import { DocumentSizeLimitExceededError } from '../documents/persistence.js';

const SERVICE_TOKEN_HEADER = 'x-internal-service-token';
const CAPTURE_PATH = /^\/internal\/documents\/([^/]+)\/capture$/;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function hasValidServiceToken(request: IncomingMessage, expectedToken: string): boolean {
  const presented = request.headers[SERVICE_TOKEN_HEADER];

  if (typeof presented !== 'string') {
    return false;
  }

  const expected = Buffer.from(expectedToken, 'utf8');
  const actual = Buffer.from(presented, 'utf8');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Handles only internal capture requests; the regular Hocuspocus response remains untouched. */
export async function handleInternalDocumentCapture(
  request: IncomingMessage,
  response: ServerResponse,
  instance: Hocuspocus,
  config: Pick<CollaborationConfig, 'internalServiceToken'>,
  api: InternalApiClient,
): Promise<boolean> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (!path.startsWith('/internal/')) {
    return false;
  }

  const match = CAPTURE_PATH.exec(path);

  if (match === null) {
    sendJson(response, 404, { code: 'not_found' });
    return true;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { code: 'method_not_allowed' });
    return true;
  }

  if (!hasValidServiceToken(request, config.internalServiceToken)) {
    sendJson(response, 401, { code: 'unauthorized' });
    return true;
  }

  let pageId: string;

  try {
    ({ pageId } = parsePageDocumentName(`page:${decodeURIComponent(match[1] ?? '')}`));
  } catch {
    sendJson(response, 400, { code: 'invalid_page_id' });
    return true;
  }

  try {
    const state = await new DocumentCapture(api).capture(pageId, instance);
    sendJson(response, 200, {
      pageId: state.pageId,
      storageRevision: state.storageRevision.toString(),
      tiptapSchemaVersion: state.tiptapSchemaVersion,
      yjsState: Buffer.from(state.yjsState).toString('base64'),
    });
  } catch (error) {
    if (error instanceof ApiDeniedError && error.status === 404) {
      sendJson(response, 404, { code: 'not_found' });
    } else if (error instanceof ApiUnavailableError) {
      sendJson(response, 503, { code: 'capture_unavailable' });
    } else if (error instanceof DocumentSizeLimitExceededError) {
      sendJson(response, 413, { code: 'document_too_large' });
    } else if (error instanceof DocumentCaptureEncodingError) {
      sendJson(response, 500, { code: 'capture_failed' });
    } else {
      sendJson(response, 503, { code: 'capture_unavailable' });
    }
  }

  return true;
}
