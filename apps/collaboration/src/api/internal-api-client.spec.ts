import { describe, expect, it, vi } from 'vitest';

import { ApiDeniedError } from './errors/api-denied.error.js';
import { ApiUnavailableError } from './errors/api-unavailable.error.js';
import { InternalApiClient } from './internal-api-client.js';

function clientWith(fetchImpl: typeof fetch): InternalApiClient {
  return new InternalApiClient({
    baseUrl: 'http://api.test',
    fetchImpl,
    serviceToken: 'service-token-value-of-32-characters',
    timeoutMs: 100,
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('InternalApiClient', () => {
  describe.each(['readDocumentRecord', 'replaceDocument'] as const)('%s', (operation) => {
    const validRecord = {
      pageId: 'page',
      storageRevision: '9007199254740993',
      tiptapSchemaVersion: 2,
      yjsState: 'AQIDBA==',
    };

    function requestDocument(
      client: InternalApiClient,
    ): ReturnType<typeof client.readDocumentRecord> {
      return operation === 'readDocumentRecord'
        ? client.readDocumentRecord('page')
        : client.replaceDocument('page', new Uint8Array([1, 2, 3, 4]));
    }

    it('возвращает bytes и точные persisted metadata', async () => {
      const client = clientWith(vi.fn(async () => jsonResponse(200, validRecord)));

      await expect(requestDocument(client)).resolves.toEqual({
        pageId: 'page',
        storageRevision: 9007199254740993n,
        tiptapSchemaVersion: 2,
        yjsState: new Uint8Array([1, 2, 3, 4]),
      });
    });

    it('принимает пустое состояние и начальную revision', async () => {
      const client = clientWith(
        vi.fn(async () =>
          jsonResponse(200, {
            ...validRecord,
            storageRevision: '0',
            tiptapSchemaVersion: 1,
            yjsState: '',
          }),
        ),
      );

      await expect(requestDocument(client)).resolves.toEqual({
        pageId: 'page',
        storageRevision: 0n,
        tiptapSchemaVersion: 1,
        yjsState: new Uint8Array(),
      });
    });

    it.each([
      ...['', '-1', '01', '1.5', '1e3', 'revision', ' 1', 1, null, undefined].map(
        (storageRevision) => ({ field: 'storageRevision', value: storageRevision }),
      ),
      ...[0, -1, 1.5, '1', null, undefined].map((tiptapSchemaVersion) => ({
        field: 'tiptapSchemaVersion',
        value: tiptapSchemaVersion,
      })),
      ...['!!!', 'AQ', 'AQ=', 'AQ===', 'AQ==\n', 'AQ-_', 'AR==', 'AQJ=', 123, null, undefined].map(
        (yjsState) => ({ field: 'yjsState', value: yjsState }),
      ),
      ...[123, null, undefined].map((pageId) => ({ field: 'pageId', value: pageId })),
    ])('отклоняет некорректное поле $field: $value', async ({ field, value }) => {
      const client = clientWith(
        vi.fn(async () => jsonResponse(200, { ...validRecord, [field]: value })),
      );
      const response = requestDocument(client);

      await expect(response).rejects.toBeInstanceOf(ApiUnavailableError);
      await expect(response).rejects.toMatchObject({ reason: 'MalformedDocumentResponse' });
    });

    it.each(
      [null, false, 42, 'document', {}, [], [validRecord], { constructor: null }].map((body) => ({
        body,
      })),
    )('отклоняет некорректное тело ответа: $body', async ({ body }) => {
      const client = clientWith(vi.fn(async () => jsonResponse(200, body)));
      const response = requestDocument(client);

      await expect(response).rejects.toBeInstanceOf(ApiUnavailableError);
      await expect(response).rejects.toMatchObject({ reason: 'MalformedDocumentResponse' });
    });

    it.each([400, 401, 403, 404])('сохраняет авторитетный отказ %s без retry', async (status) => {
      const fetchImpl = vi.fn(async () => jsonResponse(status, {}));
      const response = requestDocument(clientWith(fetchImpl));

      await expect(response).rejects.toBeInstanceOf(ApiDeniedError);
      await expect(response).rejects.toMatchObject({ status });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it.each([500, 502, 503])('сохраняет недоступность API при %s', async (status) => {
      const client = clientWith(vi.fn(async () => jsonResponse(status, {})));
      const response = requestDocument(client);

      await expect(response).rejects.toBeInstanceOf(ApiUnavailableError);
      await expect(response).rejects.toMatchObject({ reason: `status ${status}` });
    });
  });

  it('возвращает личность с моментом истечения', async () => {
    const expiresAt = new Date(Date.now() + 900_000);
    const client = clientWith(
      vi.fn(async () =>
        jsonResponse(200, {
          expiresAt: expiresAt.toISOString(),
          sessionId: 'session',
          userId: 'user',
        }),
      ) as unknown as typeof fetch,
    );

    await expect(client.authenticate('token')).resolves.toEqual({
      expiresAt,
      sessionId: 'session',
      userId: 'user',
    });
  });

  it('пробрасывает токен клиента на проверку доступа', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { canWrite: true, pageId: 'page', role: 'editor', userId: 'user' }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.authorizePage('client-token', 'page');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer client-token');
  });

  it('предъявляет сервисный креденшл на документных операциях', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        pageId: 'page',
        storageRevision: '4',
        tiptapSchemaVersion: 2,
        yjsState: '',
      }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.readDocument('page');

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-internal-service-token']).toBe('service-token-value-of-32-characters');
    expect(headers.authorization).toBeUndefined();
  });

  it.each([400, 401, 403, 404])('трактует %s как авторитетный отказ', async (status) => {
    const client = clientWith(
      vi.fn(async () => jsonResponse(status, { message: 'no' })) as unknown as typeof fetch,
    );

    await expect(client.authorizePage('token', 'page')).rejects.toBeInstanceOf(ApiDeniedError);
  });

  it.each([500, 502, 503])('трактует %s как недоступность', async (status) => {
    const client = clientWith(
      vi.fn(async () => jsonResponse(status, {})) as unknown as typeof fetch,
    );

    await expect(client.authorizePage('token', 'page')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('трактует сетевую ошибку как недоступность, а не отказ', async () => {
    const client = clientWith(
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
    );

    await expect(client.authorizePage('token', 'page')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('трактует таймаут как недоступность', async () => {
    const client = clientWith(
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ) as unknown as typeof fetch,
    );

    await expect(client.authorizePage('token', 'page')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('сохраняет таймаут на время чтения тела ответа', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    }));
    const client = new InternalApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      serviceToken: 'service-token-value-of-32-characters',
      timeoutMs: 10,
    });

    await expect(client.authorizePage('token', 'page')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('декодирует содержимое документа из base64', async () => {
    const state = new Uint8Array([1, 2, 3, 4]);
    const client = clientWith(
      vi.fn(async () =>
        jsonResponse(200, {
          pageId: 'page',
          storageRevision: '8',
          tiptapSchemaVersion: 3,
          yjsState: Buffer.from(state).toString('base64'),
        }),
      ) as unknown as typeof fetch,
    );

    await expect(client.readDocument('page')).resolves.toEqual(state);
  });

  it('кодирует содержимое документа в base64 при записи', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        pageId: 'page',
        storageRevision: '9',
        tiptapSchemaVersion: 1,
        yjsState: 'AQID',
      }),
    );
    const client = clientWith(fetchImpl as unknown as typeof fetch);

    await client.replaceDocument('page', new Uint8Array([1, 2, 3]));

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ yjsState: 'AQID' });
  });

  it('сохраняет точность storageRevision при чтении metadata', async () => {
    const client = clientWith(
      vi.fn(async () =>
        jsonResponse(200, {
          pageId: 'page',
          storageRevision: '9007199254740993',
          tiptapSchemaVersion: 5,
          yjsState: 'AQID',
        }),
      ) as unknown as typeof fetch,
    );

    await expect(client.readDocumentRecord('page')).resolves.toMatchObject({
      pageId: 'page',
      storageRevision: 9007199254740993n,
      tiptapSchemaVersion: 5,
      yjsState: new Uint8Array([1, 2, 3]),
    });
  });
});
