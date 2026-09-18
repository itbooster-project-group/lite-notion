/** Авторитетный отказ API: решение принято, повторять незачем. */
export class ApiDeniedError extends Error {
  constructor(readonly status: number) {
    super('API denied the request');
  }
}

/** Вердикт получить не удалось. Отказом это NOT является. */
export class ApiUnavailableError extends Error {
  constructor(readonly reason: string) {
    super('API is unavailable');
  }
}

export interface VerifiedIdentity {
  expiresAt: Date;
  sessionId: string;
  userId: string;
}

export interface PageAccessVerdict {
  canWrite: boolean;
  pageId: string;
  role: string;
  userId: string;
}

export interface InternalApiClientOptions {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const DENIAL_STATUSES = new Set([400, 401, 403, 404]);

/**
 * Клиент внутренних маршрутов API. Единственное, что он добавляет к `fetch`, —
 * разделение авторитетного отказа и невозможности его получить: на первом
 * соединение закрывается сразу, на втором живёт в пределах грейс-окна.
 */
export class InternalApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: InternalApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async authenticate(token: string): Promise<VerifiedIdentity> {
    const body = await this.request<{ expiresAt: string; sessionId: string; userId: string }>(
      'POST',
      '/internal/authenticate',
      { authorization: `Bearer ${token}` },
    );

    return {
      expiresAt: new Date(body.expiresAt),
      sessionId: body.sessionId,
      userId: body.userId,
    };
  }

  authorizePage(token: string, pageId: string): Promise<PageAccessVerdict> {
    return this.request<PageAccessVerdict>(
      'GET',
      `/internal/pages/${encodeURIComponent(pageId)}/access`,
      { authorization: `Bearer ${token}` },
    );
  }

  async readDocument(pageId: string): Promise<Uint8Array> {
    const body = await this.request<{ pageId: string; yjsState: string }>(
      'GET',
      `/internal/pages/${encodeURIComponent(pageId)}/document`,
      this.serviceHeaders(),
    );

    return new Uint8Array(Buffer.from(body.yjsState, 'base64'));
  }

  async replaceDocument(pageId: string, yjsState: Uint8Array): Promise<void> {
    await this.request(
      'PUT',
      `/internal/pages/${encodeURIComponent(pageId)}/document`,
      { ...this.serviceHeaders(), 'content-type': 'application/json' },
      JSON.stringify({ yjsState: Buffer.from(yjsState).toString('base64') }),
    );
  }

  private serviceHeaders(): Record<string, string> {
    return { 'x-internal-service-token': this.options.serviceToken };
  }

  private async request<T>(
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    let response: Response;

    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...(body === undefined ? {} : { body }),
        headers,
        method,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ApiUnavailableError(error instanceof Error ? error.name : 'UnknownError');
    } finally {
      clearTimeout(timer);
    }

    if (DENIAL_STATUSES.has(response.status)) {
      throw new ApiDeniedError(response.status);
    }

    if (!response.ok) {
      throw new ApiUnavailableError(`status ${response.status}`);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiUnavailableError('MalformedResponse');
    }
  }
}
