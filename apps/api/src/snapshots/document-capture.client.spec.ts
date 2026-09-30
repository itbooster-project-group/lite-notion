import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationConfig } from '../config/application-config';
import { NodeEnvironment } from '../config/environment';
import { PageNotFoundError } from '../pages/errors';
import { DocumentCaptureClient, DocumentCaptureUnavailableError } from './document-capture.client';

const config: ApplicationConfig = {
  accessTokenTtlS: 900,
  bcryptRounds: 12,
  collaborationBaseUrl: 'http://collaboration.test',
  collaborationTimeoutMs: 50,
  corsOrigin: 'http://localhost:3000',
  databaseConnectionTimeoutMs: 5000,
  databaseUrl: 'postgresql://user:password@localhost:5432/lite_notion',
  internalServiceToken: 'service-token-value-over-32-characters',
  jwtSecret: 'jwt-secret-value-over-32-characters',
  nodeEnvironment: NodeEnvironment.Test,
  port: 3001,
  refreshTokenTtlS: 2592000,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('DocumentCaptureClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests the direct internal endpoint and decodes the complete capture contract', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        pageId: 'page-1',
        storageRevision: '9007199254740993',
        tiptapSchemaVersion: 4,
        yjsState: 'AQID',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const captured = await new DocumentCaptureClient(config).capture('page-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(url).toBe('http://collaboration.test/internal/documents/page-1/capture');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-internal-service-token': config.internalServiceToken });
    expect(captured).toEqual({
      storageRevision: 9007199254740993n,
      tiptapSchemaVersion: 4,
      yjsState: new Uint8Array([1, 2, 3]),
    });
  });

  it('maps collaboration not-found to the existing page not-found error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(404, { code: 'not_found' })),
    );

    await expect(new DocumentCaptureClient(config).capture('missing')).rejects.toBeInstanceOf(
      PageNotFoundError,
    );
  });

  it('fails closed for transport errors and malformed capture responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('connection refused');
      }),
    );
    await expect(new DocumentCaptureClient(config).capture('page-1')).rejects.toBeInstanceOf(
      DocumentCaptureUnavailableError,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { pageId: 'other-page' })),
    );
    await expect(new DocumentCaptureClient(config).capture('page-1')).rejects.toBeInstanceOf(
      DocumentCaptureUnavailableError,
    );
  });

  it('maps an internal request timeout to capture unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );

    await expect(new DocumentCaptureClient(config).capture('page-1')).rejects.toBeInstanceOf(
      DocumentCaptureUnavailableError,
    );
  });
});
