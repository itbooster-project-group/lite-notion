import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider, useSession } from '@/entities/session';
import { clearAccessToken } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { LogoutButton } from './logout-button';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

beforeEach(() => {
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'private-token', expiresIn: 900 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  clearAccessToken();
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

function SessionStatus() {
  const { status } = useSession();
  return <output aria-label="Состояние сессии">{status}</output>;
}

describe('LogoutButton', () => {
  it('завершает текущую сессию, очищает UI state и открывает login', async () => {
    let authorization: string | null = null;
    server.use(
      http.post('*/api/v1/auth/logout', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithSession(
      <>
        <SessionStatus />
        <LogoutButton />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Состояние сессии')).toHaveTextContent('authenticated'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'));
    expect(screen.getByLabelText('Состояние сессии')).toHaveTextContent('unauthenticated');
    expect(authorization).toBe('Bearer private-token');
  });

  it('сохраняет authenticated state при recoverable logout failure', async () => {
    server.use(
      http.post('*/api/v1/auth/logout', () =>
        HttpResponse.json({ message: 'database detail' }, { status: 503 }),
      ),
    );
    renderWithSession(
      <>
        <SessionStatus />
        <LogoutButton />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Состояние сессии')).toHaveTextContent('authenticated'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выйти');
    expect(screen.getByLabelText('Состояние сессии')).toHaveTextContent('authenticated');
    expect(screen.queryByText('database detail')).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
