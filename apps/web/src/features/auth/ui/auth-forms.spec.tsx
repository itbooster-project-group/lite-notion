import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/entities/session';
import { clearAccessToken } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

const navigation = vi.hoisted(() => ({ next: '/profile', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(`next=${encodeURIComponent(navigation.next)}`),
}));

beforeEach(() => {
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    ),
  );
});

afterEach(() => {
  cleanup();
  clearAccessToken();
  navigation.next = '/profile';
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

async function fillLogin() {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: ' ADA@EXAMPLE.COM ' },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password-123' } });
}

async function fillRegistration() {
  fireEvent.change(await screen.findByLabelText('Имя'), { target: { value: ' Ada ' } });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: ' ADA@EXAMPLE.COM ' },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password-123' } });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), {
    target: { value: 'password-123' },
  });
}

describe('LoginForm', () => {
  it('не отправляет невалидную форму', async () => {
    const loginRequest = vi.fn();
    server.use(
      http.post('*/api/v1/auth/login', () => {
        loginRequest();
        return HttpResponse.json({});
      }),
    );
    renderWithSession(<LoginForm />);

    fireEvent.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Введите корректный email')).toBeInTheDocument();
    expect(loginRequest).not.toHaveBeenCalled();
  });

  it('входит через generated client и возвращает на безопасный next', async () => {
    let requestBody: unknown;
    server.use(
      http.post('*/api/v1/auth/login', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          accessToken: 'access-login',
          expiresIn: 900,
          user: {
            createdAt: '2026-08-21T12:00:00.000Z',
            email: 'ada@example.com',
            id: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d',
            name: 'Ada',
          },
        });
      }),
    );
    renderWithSession(<LoginForm />);
    await fillLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/profile'));
    expect(requestBody).toEqual({ email: 'ada@example.com', password: 'password-123' });
  });

  it('показывает одинаковую безопасную ошибку для 401', async () => {
    server.use(
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ message: 'internal detail' }, { status: 401 }),
      ),
    );
    renderWithSession(<LoginForm />);
    await fillLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
    expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
  });

  it('показывает pending state до ответа', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    server.use(
      http.post(
        '*/api/v1/auth/login',
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    renderWithSession(<LoginForm />);
    await fillLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('button', { name: 'Входим…' })).toBeDisabled();
    resolveRequest?.(
      HttpResponse.json({
        accessToken: 'access-login',
        expiresIn: 900,
        user: {
          createdAt: '2026-08-21T12:00:00.000Z',
          email: 'ada@example.com',
          id: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d',
          name: 'Ada',
        },
      }),
    );
  });
});

describe('RegisterForm', () => {
  it('регистрирует через generated client без поля confirmation', async () => {
    let requestBody: unknown;
    server.use(
      http.post('*/api/v1/auth/register', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(
          {
            accessToken: 'access-register',
            expiresIn: 900,
            user: {
              createdAt: '2026-08-21T12:00:00.000Z',
              email: 'ada@example.com',
              id: '4c8f1b1a-0f6d-4a5e-9f6d-0f6d4a5e9f6d',
              name: 'Ada',
            },
          },
          { status: 201 },
        );
      }),
    );
    renderWithSession(<RegisterForm />);
    await fillRegistration();

    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/profile'));
    expect(requestBody).toEqual({
      email: 'ada@example.com',
      name: 'Ada',
      password: 'password-123',
    });
  });

  it('показывает field error для несовпадающих паролей', async () => {
    renderWithSession(<RegisterForm />);
    await fillRegistration();
    fireEvent.change(screen.getByLabelText('Повторите пароль'), {
      target: { value: 'different-password' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();
  });

  it('показывает безопасную ошибку занятого email', async () => {
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ message: 'database conflict' }, { status: 409 }),
      ),
    );
    renderWithSession(<RegisterForm />);
    await fillRegistration();

    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Аккаунт с таким email уже существует',
    );
    expect(screen.queryByText('database conflict')).not.toBeInTheDocument();
  });

  it('показывает generic error без сырого ответа API', async () => {
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json({ message: 'secret server detail' }, { status: 503 }),
      ),
    );
    renderWithSession(<RegisterForm />);
    await fillRegistration();

    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось зарегистрироваться');
    expect(screen.queryByText('secret server detail')).not.toBeInTheDocument();
  });
});
