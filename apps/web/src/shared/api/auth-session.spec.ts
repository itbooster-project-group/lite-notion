import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAccessToken,
  configureAuthTransport,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from './auth-session';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  clearAccessToken();
});

function createDeferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

describe('auth session generations', () => {
  it('не применяет refresh token после очистки сессии', async () => {
    const pendingRefresh = createDeferred<string>();
    const refresh = vi.fn(() => pendingRefresh.promise);
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: refresh, onSessionExpired: vi.fn() }),
    );
    setAccessToken('access-one');

    const outcome = refreshAccessToken();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    clearAccessToken();
    pendingRefresh.resolve('stale-access-two');

    await expect(outcome).resolves.toBe('superseded');
    expect(getAccessToken()).toBeUndefined();
  });

  it('не вызывает callbacks новой configuration из старого refresh', async () => {
    const pendingOldRefresh = createDeferred<string>();
    const oldExpired = vi.fn();
    const removeOldConfiguration = configureAuthTransport({
      refreshAccessToken: () => pendingOldRefresh.promise,
      onSessionExpired: oldExpired,
    });
    const oldOutcome = refreshAccessToken();
    removeOldConfiguration();

    const pendingNewRefresh = createDeferred<string>();
    const newRefresh = vi.fn(() => pendingNewRefresh.promise);
    const newExpired = vi.fn();
    cleanups.push(
      configureAuthTransport({ refreshAccessToken: newRefresh, onSessionExpired: newExpired }),
    );
    const newOutcome = refreshAccessToken();
    await vi.waitFor(() => expect(newRefresh).toHaveBeenCalledTimes(1));

    pendingOldRefresh.reject(Object.assign(new Error('Unauthorized'), { status: 401 }));
    await expect(oldOutcome).resolves.toBe('superseded');
    expect(oldExpired).not.toHaveBeenCalled();
    expect(newExpired).not.toHaveBeenCalled();

    const sameNewOutcome = refreshAccessToken();
    expect(newRefresh).toHaveBeenCalledTimes(1);
    pendingNewRefresh.resolve('access-new');
    await expect(Promise.all([newOutcome, sameNewOutcome])).resolves.toEqual([
      'refreshed',
      'refreshed',
    ]);
    expect(newRefresh).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('access-new');
  });
});
