import { describe, expect, it, vi } from 'vitest';

import { createPageDocumentSessionLifecycle } from './page-document-session';

describe('page document session lifecycle', () => {
  it('выполняет cleanup идемпотентно', () => {
    const lifecycle = createPageDocumentSessionLifecycle();
    const cleanup = vi.fn();
    lifecycle.addCleanup(cleanup);

    lifecycle.destroy();
    lifecycle.destroy();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(lifecycle.isDestroyed()).toBe(true);
  });

  it('не выполняет stale callback после destroy', () => {
    const lifecycle = createPageDocumentSessionLifecycle();
    const replacementState = { value: 'replacement' };
    const callback = vi.fn((value: string) => {
      replacementState.value = value;
    });
    const guardedCallback = lifecycle.guard(callback);

    guardedCallback('active');
    lifecycle.destroy();
    replacementState.value = 'replacement';
    guardedCallback('stale');

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith('active');
    expect(replacementState.value).toBe('replacement');
  });

  it('очищает зарегистрированный local timer', () => {
    vi.useFakeTimers();
    const lifecycle = createPageDocumentSessionLifecycle();
    const callback = vi.fn();
    const timer = window.setTimeout(lifecycle.guard(callback), 100);
    lifecycle.addCleanup(() => window.clearTimeout(timer));

    lifecycle.destroy();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('сразу очищает resource, зарегистрированный после destroy', () => {
    const lifecycle = createPageDocumentSessionLifecycle();
    const cleanup = vi.fn();
    lifecycle.destroy();

    lifecycle.addCleanup(cleanup);

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
