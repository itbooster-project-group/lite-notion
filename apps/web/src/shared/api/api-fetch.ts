import {
  canRefreshAccessToken,
  expireSession,
  getAuthStateSnapshot,
  isAuthStateCurrent,
  refreshAccessToken,
} from './auth-session';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export type ErrorType<ErrorData> = Error & {
  info?: ErrorData;
  status?: number;
};

export type BodyType<BodyData> = BodyData;

export type ApiFetchOptions = RequestInit & {
  skipAuthRefresh?: boolean;
};

export async function apiFetch<ResponseData>(
  url: string,
  options: ApiFetchOptions,
): Promise<ResponseData> {
  const { skipAuthRefresh = false, ...requestOptions } = options;
  const requestState = getAuthStateSnapshot();

  try {
    return await performRequest<ResponseData>(url, requestOptions, requestState.accessToken);
  } catch (error) {
    if (!isUnauthorized(error) || skipAuthRefresh || !canRefreshAccessToken()) {
      throw error;
    }

    if (isAuthStateCurrent(requestState)) {
      await refreshAccessToken();
    }

    const retryState = getAuthStateSnapshot();

    try {
      return await performRequest<ResponseData>(url, requestOptions, retryState.accessToken);
    } catch (retryError) {
      if (isUnauthorized(retryError)) {
        expireSession(retryState);
      }

      throw retryError;
    }
  }
}

async function performRequest<ResponseData>(
  url: string,
  options: RequestInit,
  accessToken: string | undefined,
): Promise<ResponseData> {
  const headers = new Headers(options.headers);

  if (accessToken !== undefined) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(new URL(url, apiBaseUrl), {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  });
  const body = [204, 205, 304].includes(response.status) ? '' : await response.text();
  const data = parseResponseBody(body);

  if (!response.ok) {
    const error = new Error(
      `API request failed with status ${response.status}`,
    ) as ErrorType<unknown>;
    error.info = data;
    error.status = response.status;
    throw error;
  }

  return data as ResponseData;
}

function parseResponseBody(body: string): unknown {
  if (body.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function isUnauthorized(error: unknown): error is ErrorType<unknown> {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 401;
}
