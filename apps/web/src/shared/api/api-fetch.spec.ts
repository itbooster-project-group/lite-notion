import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, type ErrorType } from './api-fetch';
import {
  clearAccessToken,
  configureAuthTransport,
  getAccessToken,
  setAccessToken,
} from './auth-session';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  clearAccessToken();
  vi.unstubAllGlobals();
});

describe('apiFetch auth transport', () => {
  it('отправляет credentials и in-memory Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('access-one');

    await apiFetch('/api/v1/test', { method: 'GET' });

    const [, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer access-one');
  });

  it('делит один refresh между параллельными ответами 401', async () => {
    let protectedCalls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      protectedCalls += 1;
      return Promise.resolve(
        protectedCalls <= 2
          ? Response.json({ message: 'Unauthorized' }, { status: 401 })
          : Response.json({ ok: true }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue('access-two');
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: vi.fn() }),
    );

    const results = await Promise.all([
      apiFetch<{ ok: boolean }>('/api/v1/private-a', { method: 'GET' }),
      apiFetch<{ ok: boolean }>('/api/v1/private-b', { method: 'GET' }),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryOptions = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(new Headers(retryOptions.headers).get('Authorization')).toBe('Bearer access-two');
  });

  it('не обновляет токен повторно для запоздалого 401 старого поколения', async () => {
    let releaseSecondUnauthorized: (() => void) | undefined;
    const fetchMock = vi.fn((input: URL | RequestInfo, options?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const authorization = new Headers(options?.headers).get('Authorization');

      if (authorization === 'Bearer access-one' && path.endsWith('/private-a')) {
        return Promise.resolve(Response.json({ message: 'Unauthorized' }, { status: 401 }));
      }

      if (authorization === 'Bearer access-one' && path.endsWith('/private-b')) {
        return new Promise<Response>((resolve) => {
          releaseSecondUnauthorized = () =>
            resolve(Response.json({ message: 'Unauthorized' }, { status: 401 }));
        });
      }

      return Promise.resolve(Response.json({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('access-one');
    const refresh = vi.fn().mockResolvedValue('access-two');
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: vi.fn() }),
    );

    const firstRequest = apiFetch<{ ok: boolean }>('/api/v1/private-a', { method: 'GET' });
    const secondRequest = apiFetch<{ ok: boolean }>('/api/v1/private-b', { method: 'GET' });

    await expect(firstRequest).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    releaseSecondUnauthorized?.();
    await expect(secondRequest).resolves.toEqual({ ok: true });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const lastOptions = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(new Headers(lastOptions.headers).get('Authorization')).toBe('Bearer access-two');
  });

  it('не завершает новую сессию по запоздалому 401 повторного запроса', async () => {
    let releaseFirstUnauthorized: (() => void) | undefined;
    let releaseRetryUnauthorized: (() => void) | undefined;
    const fetchMock = vi.fn((_input: URL | RequestInfo, options?: RequestInit) => {
      const authorization = new Headers(options?.headers).get('Authorization');

      if (authorization === 'Bearer access-one') {
        return new Promise<Response>((resolve) => {
          releaseFirstUnauthorized = () =>
            resolve(Response.json({ message: 'Unauthorized' }, { status: 401 }));
        });
      }

      return new Promise<Response>((resolve) => {
        releaseRetryUnauthorized = () =>
          resolve(Response.json({ message: 'Unauthorized' }, { status: 401 }));
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('access-one');
    const onSessionExpired = vi.fn();
    const refresh = vi.fn().mockResolvedValue('unused');
    cleanups.push(configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired }));

    const request = apiFetch('/api/v1/private', { method: 'GET' });
    setAccessToken('access-two');
    releaseFirstUnauthorized?.();
    await vi.waitFor(() => expect(releaseRetryUnauthorized).toBeTypeOf('function'));
    setAccessToken('access-three');
    releaseRetryUnauthorized?.();

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('access-three');
  });

  it('не запускает refresh повторно и завершает сессию после второго 401', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ message: 'Unauthorized' }, { status: 401 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue('access-two');
    const onSessionExpired = vi.fn();
    cleanups.push(configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired }));

    await expect(apiFetch('/api/v1/private', { method: 'GET' })).rejects.toMatchObject({
      status: 401,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('очищает сессию при окончательном 401 refresh без recursive retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const refreshError = Object.assign(new Error('Unauthorized'), {
      status: 401,
    }) as ErrorType<unknown>;
    const refresh = vi.fn().mockRejectedValue(refreshError);
    const onSessionExpired = vi.fn();
    cleanups.push(configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired }));

    await expect(apiFetch('/api/v1/private', { method: 'GET' })).rejects.toBe(refreshError);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('позволяет публичной операции отключить auth refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn().mockResolvedValue('unused');
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: vi.fn() }),
    );

    await expect(
      apiFetch('/api/v1/auth/login', { method: 'POST', skipAuthRefresh: true }),
    ).rejects.toMatchObject({ status: 401 });

    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
