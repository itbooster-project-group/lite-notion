import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppShellStore } from '../model/app-shell-store';
import { AppShell } from './app-shell';

let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

type MatchMediaController = {
  dispatch: (matches: boolean) => void;
};

function mockMatchMedia(initialMatches = false): MatchMediaController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    matches: initialMatches,
    media: '(min-width: 48rem)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  );

  return {
    dispatch: (matches) => {
      Object.defineProperty(mediaQuery, 'matches', { configurable: true, value: matches });
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
}

function renderShell(children: ReactNode = <h1>Рабочая область</h1>) {
  return render(
    <AppShell
      actions={<div>Действия</div>}
      pageTree={<nav aria-label="Дерево страниц">Страницы</nav>}
      user={<div>Пользователь</div>}
    >
      {children}
    </AppShell>,
  );
}

beforeEach(() => {
  pathname = '/';
  localStorage.clear();
  useAppShellStore.setState({ desktopCollapsed: false, mobileOpen: false });
  mockMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('размещает слоты в именованном сайдбаре и children в единственной main-области', async () => {
    renderShell();

    await waitFor(() => expect(screen.getByText('Пользователь')).toBeInTheDocument());
    expect(screen.getByText('Действия')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Дерево страниц' })).toBeInTheDocument();
    expect(screen.getAllByRole('complementary', { name: 'Боковая панель' })).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveTextContent('Рабочая область');
  });

  it('работает без опциональных слотов', async () => {
    render(<AppShell>Контент</AppShell>);

    await waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('Контент'));
    expect(document.querySelector('[data-slot="sidebar-user"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="sidebar-actions"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="sidebar-page-tree"]')).not.toBeInTheDocument();
  });

  it('сворачивает и разворачивает desktop-сайдбар доступной кнопкой', async () => {
    renderShell();
    const collapse = await screen.findByRole('button', { name: 'Свернуть боковую панель' });

    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(collapse).toHaveAttribute('aria-controls', 'desktop-sidebar');
    fireEvent.click(collapse);

    const expand = screen.getByRole('button', { name: 'Развернуть боковую панель' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Пользователь')).not.toBeInTheDocument();
    fireEvent.click(expand);
    expect(screen.getByText('Пользователь')).toBeInTheDocument();
  });

  it('открывает и закрывает mobile-overlay, не меняя desktop-предпочтение', async () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Открыть боковую панель' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Боковая панель' });
    expect(
      within(dialog).getByRole('complementary', { name: 'Боковая панель' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть боковую панель' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(useAppShellStore.getState().desktopCollapsed).toBe(false);
  });

  it('закрывает mobile-overlay по Escape и клику на подложку', async () => {
    const { container } = renderShell();
    const trigger = screen.getByRole('button', { name: 'Открыть боковую панель' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    const backdrop = container.ownerDocument.querySelector('[data-open][role="presentation"]');
    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop as Element);
    fireEvent.click(backdrop as Element);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('закрывает mobile-overlay после навигации и при переходе к desktop-ширине', async () => {
    const media = mockMatchMedia();
    const { rerender } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть боковую панель' }));
    await screen.findByRole('dialog');

    pathname = '/next';
    rerender(<AppShell>Следующая страница</AppShell>);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Открыть боковую панель' }));
    await screen.findByRole('dialog');
    media.dispatch(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useAppShellStore.getState().desktopCollapsed).toBe(false);
  });

  it('задаёт responsive-контракт desktop sidebar и mobile trigger', async () => {
    renderShell();
    const desktopSidebar = await screen.findByRole('complementary', { name: 'Боковая панель' });
    const mobileTrigger = screen.getByRole('button', { name: 'Открыть боковую панель' });

    expect(desktopSidebar).toHaveClass('hidden', 'md:flex');
    expect(mobileTrigger.parentElement).toHaveClass('md:hidden');
  });
});
