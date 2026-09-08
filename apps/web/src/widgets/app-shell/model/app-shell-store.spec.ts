import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_SHELL_STORAGE_KEY, useAppShellStore } from './app-shell-store';

const initialState = {
  desktopCollapsed: false,
  mobileOpen: false,
};

beforeEach(() => {
  localStorage.clear();
  useAppShellStore.setState(initialState);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAppShellStore', () => {
  it('управляет desktop и mobile состояниями независимо', () => {
    useAppShellStore.getState().toggleDesktop();
    useAppShellStore.getState().openMobile();

    expect(useAppShellStore.getState()).toMatchObject({
      desktopCollapsed: true,
      mobileOpen: true,
    });

    useAppShellStore.getState().closeMobile();
    expect(useAppShellStore.getState()).toMatchObject({
      desktopCollapsed: true,
      mobileOpen: false,
    });
  });

  it('сохраняет и восстанавливает только desktop-предпочтение', async () => {
    useAppShellStore.getState().toggleDesktop();
    useAppShellStore.getState().openMobile();

    expect(localStorage.getItem(APP_SHELL_STORAGE_KEY)).not.toContain('mobileOpen');
    const persistedState = localStorage.getItem(APP_SHELL_STORAGE_KEY);

    useAppShellStore.setState(initialState);
    if (persistedState) {
      localStorage.setItem(APP_SHELL_STORAGE_KEY, persistedState);
    }
    await useAppShellStore.persist.rehydrate();

    expect(useAppShellStore.getState()).toMatchObject({
      desktopCollapsed: true,
      mobileOpen: false,
    });
  });

  it('остаётся работоспособным при ошибке localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    await expect(useAppShellStore.persist.rehydrate()).resolves.toBeUndefined();
    expect(() => useAppShellStore.getState().toggleDesktop()).not.toThrow();
    expect(useAppShellStore.getState().desktopCollapsed).toBe(true);
  });
});
