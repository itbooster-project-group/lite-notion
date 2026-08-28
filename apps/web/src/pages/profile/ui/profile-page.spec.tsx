import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionProvider } from '@/entities/session';
import { clearAccessToken } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { ProfilePage } from './profile-page';

const user = {
  createdAt: '2026-08-21T12:00:00.000Z',
  email: 'ada@example.com',
  id: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d',
  name: 'Ada',
};

beforeEach(() => {
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'private-token', expiresIn: 900 }),
    ),
    http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
  );
});

afterEach(() => {
  cleanup();
  clearAccessToken();
});

function renderWithSession(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>,
  );
}

describe('ProfilePage', () => {
  it('показывает имя, email и дату регистрации простым списком', async () => {
    renderWithSession(<ProfilePage />);

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText('Имя')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Дата регистрации')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.queryByText(user.id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сохран/i })).not.toBeInTheDocument();
  });
});
