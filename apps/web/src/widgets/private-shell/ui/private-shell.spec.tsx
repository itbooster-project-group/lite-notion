import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrivateShell } from './private-shell';

const session = vi.hoisted<{ user: { name: string } | undefined }>(() => ({
  user: undefined,
}));

vi.mock('@/entities/session', () => ({
  useSession: () => session,
}));

vi.mock('@/features/auth', () => ({
  LogoutButton: () => <button type="button">Выйти</button>,
}));

beforeEach(() => {
  session.user = { name: 'Ada Lovelace' };
});

afterEach(cleanup);

describe('private shell navigation', () => {
  it('отображает переданные хлебные крошки и в профиль по видимому имени пользователя', () => {
    render(
      <PrivateShell breadcrumbs={<nav aria-label="Хлебные крошки">Проекты</nav>}>
        <main>Приватный экран</main>
      </PrivateShell>,
    );

    expect(screen.queryByRole('link', { name: 'Lite Notion' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent('Проекты');
    const headerContent = screen.getByRole('banner').firstElementChild;
    expect(headerContent).not.toHaveClass('max-w-shell', 'mx-auto');
    expect(headerContent).toHaveClass('pl-14', 'pr-page-inline', 'md:px-page-inline');

    const profileLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(profileLink).toHaveAttribute('title', 'Ada Lovelace');
    expect(profileLink).toHaveClass('max-w-24', 'truncate', 'sm:max-w-48');
    expect(profileLink).not.toHaveClass('hidden');

    expect(screen.queryByRole('link', { name: 'Главная' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Профиль' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.getByText('Приватный экран')).toBeInTheDocument();
  });

  it('сохраняет доступный переход в профиль до появления имени пользователя', () => {
    session.user = undefined;

    render(
      <PrivateShell breadcrumbs={<nav aria-label="Хлебные крошки">Проекты</nav>}>
        Контент
      </PrivateShell>,
    );

    const profileLink = screen.getByRole('link', { name: 'Профиль' });
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(profileLink).toHaveAttribute('title', 'Профиль');
  });
});
