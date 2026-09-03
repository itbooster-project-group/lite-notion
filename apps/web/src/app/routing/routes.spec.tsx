import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/entities/session';
import { server } from '@/shared/api/mocks/server';

import { AuthRoute } from './auth-route';
import { PrivateRoute } from './private-route';

const navigation = vi.hoisted(() => ({ pathname: '/profile', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'restored-token', expiresIn: 900 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  navigation.pathname = '/profile';
  navigation.replace.mockReset();
});

function renderWithSession(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>,
  );
}

describe('auth route guards', () => {
  it('показывает приватный экран после восстановления', async () => {
    renderWithSession(
      <PrivateRoute>
        <p>Приватный экран</p>
      </PrivateRoute>,
    );

    expect(await screen.findByText('Приватный экран')).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('перенаправляет гостя на login с безопасным next', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    renderWithSession(
      <PrivateRoute>
        <p>Скрытый экран</p>
      </PrivateRoute>,
    );

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login?next=%2Fprofile'));
    expect(screen.queryByText('Скрытый экран')).not.toBeInTheDocument();
  });

  it('перенаправляет аутентифицированного пользователя с auth route', async () => {
    renderWithSession(
      <AuthRoute>
        <p>Форма входа</p>
      </AuthRoute>,
    );

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('Форма входа')).not.toBeInTheDocument();
  });
});
