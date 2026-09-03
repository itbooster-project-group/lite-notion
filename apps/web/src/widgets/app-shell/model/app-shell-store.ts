import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export const APP_SHELL_STORAGE_KEY = 'lite-notion:app-shell:v1';

type AppShellState = {
  desktopCollapsed: boolean;
  mobileOpen: boolean;
  toggleDesktop: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  setMobileOpen: (open: boolean) => void;
};

const memoryStorage = new Map<string, string>();

export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return memoryStorage.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      memoryStorage.set(name, value);
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      memoryStorage.delete(name);
    }
  },
};

export const useAppShellStore = create<AppShellState>()(
  persist(
    (set) => ({
      desktopCollapsed: false,
      mobileOpen: false,
      toggleDesktop: () => set((state) => ({ desktopCollapsed: !state.desktopCollapsed })),
      openMobile: () => set({ mobileOpen: true }),
      closeMobile: () => set({ mobileOpen: false }),
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
    }),
    {
      name: APP_SHELL_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ desktopCollapsed }) => ({ desktopCollapsed }),
      skipHydration: true,
    },
  ),
);
