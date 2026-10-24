import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '@/shared/api';
import { PrivateShell } from './private-shell';

const session = vi.hoisted<{
  user: { avatarAssetId?: string | null; id?: string; name: string } | undefined;
}>(() => ({
  user: undefined,
}));

vi.mock('@/entities/session', () => ({
  useSession: () => session,
}));

vi.mock('@/features/auth', () => ({
  LogoutButton: () => <button type="button">Выйти</button>,
}));

beforeEach(() => {
  session.user = { id: 'user-a', name: 'Ada Lovelace' };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderShell(headerStart?: ReactNode, breadcrumbText = 'Проекты') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivateShell
        breadcrumbs={<nav aria-label="Хлебные крошки">{breadcrumbText}</nav>}
        headerStart={headerStart}
      >
        <main>Приватный экран</main>
      </PrivateShell>
    </QueryClientProvider>,
  );
}

describe('private shell navigation', () => {
  it('показывает аватар вместо имени и оставляет доступный переход в профиль', () => {
    renderShell();

    expect(screen.queryByRole('link', { name: 'Lite Notion' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent('Проекты');
    const headerContent = screen.getByRole('banner').firstElementChild;
    expect(headerContent).not.toHaveClass('max-w-shell', 'mx-auto');
    expect(headerContent).toHaveClass('px-page-inline');
    expect(headerContent).not.toHaveClass('pl-14', 'pr-page-inline', 'md:px-page-inline');

    const profileLink = screen.getByRole('link', { name: 'Профиль: Ada Lovelace' });
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(profileLink).toHaveAttribute('title', 'Ada Lovelace');
    expect(profileLink).toHaveClass('size-8', 'rounded-full');
    expect(profileLink).toHaveTextContent('A');
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();

    expect(screen.queryByRole('link', { name: 'Главная' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Профиль' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByText('Приватный экран')).toBeInTheDocument();
  });

  it('рендерит headerStart как обычный слот без компенсации layout под внешний trigger', () => {
    renderShell(<button type="button">Меню</button>);

    const headerContent = screen.getByRole('banner').firstElementChild;
    expect(screen.getByRole('button', { name: 'Меню' })).toBeInTheDocument();
    expect(headerContent).toHaveClass('px-page-inline');
    expect(headerContent).not.toHaveClass('pl-14', 'ml-14');
  });

  it('сохраняет длинное слово в breadcrumbs целиком для переноса', () => {
    const breadcrumbText = 'Оченьдлинноесловобезпробелов'.repeat(12);
    renderShell(undefined, breadcrumbText);

    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      breadcrumbText,
    );
  });

  it('сохраняет доступный переход в профиль до появления имени пользователя', () => {
    session.user = undefined;

    renderShell();

    const profileLink = screen.getByRole('link', { name: 'Профиль' });
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(profileLink).toHaveAttribute('title', 'Профиль');
  });

  it('показывает загруженное изображение и возвращает fallback, если оно недоступно', async () => {
    session.user = {
      id: 'user-a',
      name: 'Ada Lovelace',
      avatarAssetId: 'asset-a',
    };
    vi.spyOn(api, 'createAvatarReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/ada.jpg',
      expiresInSeconds: 300,
    });

    renderShell();

    expect(await screen.findByRole('img', { name: 'Ada Lovelace: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/ada.jpg',
    );
  });
});
