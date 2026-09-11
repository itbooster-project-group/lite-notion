import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageAccessPanel } from './page-access-panel';

const state = vi.hoisted(() => ({
  grant: vi.fn().mockResolvedValue(undefined),
  revoke: vi.fn().mockResolvedValue(undefined),
  setAccessMode: vi.fn().mockResolvedValue({ accessMode: 'restricted' }),
  permissionsQuery: {
    data: [
      {
        createdAt: '2026-09-12T00:00:00.000Z',
        email: 'editor@example.com',
        name: 'Editor',
        role: 'editor',
        updatedAt: '2026-09-12T00:00:00.000Z',
        userId: 'user-2',
      },
    ],
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  },
  grantMutation: { isPending: false },
  revokeMutation: { isPending: false },
  accessModeMutation: { isPending: false },
}));

vi.mock('../model/use-page-access', () => ({
  usePageAccess: () => state,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PageAccessPanel', () => {
  it('показывает direct grants отдельно и отправляет grant по email', async () => {
    render(<PageAccessPanel page={{ accessMode: 'inherit', id: 'page-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Настроить доступ' }));

    expect(await screen.findByText(/Editor \(editor@example.com\) — editor/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email пользователя' }), {
      target: { value: 'viewer@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => expect(state.grant).toHaveBeenCalledWith('viewer@example.com', 'viewer'));
  });

  it('изменяет роль существующего direct grant через grant mutation', async () => {
    render(<PageAccessPanel page={{ accessMode: 'inherit', id: 'page-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Настроить доступ' }));

    fireEvent.click(await screen.findByRole('combobox', { name: 'Роль для editor@example.com' }));
    const viewer = await screen.findByRole('option', { name: 'Просмотр' });
    fireEvent.pointerDown(viewer);
    fireEvent.click(viewer);

    await waitFor(() => expect(state.grant).toHaveBeenCalledWith('editor@example.com', 'viewer'));
  });

  it('показывает предупреждение перед access-mode mutation', async () => {
    render(<PageAccessPanel page={{ accessMode: 'inherit', id: 'page-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Настроить доступ' }));

    fireEvent.click(await screen.findByRole('combobox', { name: 'Режим наследования' }));
    const restricted = await screen.findByRole('option', { name: 'Ограничить наследование' });
    fireEvent.pointerDown(restricted);
    fireEvent.click(restricted);

    expect(
      await screen.findByRole('dialog', { name: 'Изменить режим доступа?' }),
    ).toHaveTextContent('может повлиять на доступ');
    expect(state.setAccessMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    await waitFor(() => expect(state.setAccessMode).toHaveBeenCalledWith('restricted'));
  });

  it('показывает empty state и retry для ошибки permissions query', async () => {
    state.permissionsQuery.data = [];
    state.permissionsQuery.isError = true;
    render(<PageAccessPanel page={{ accessMode: 'inherit', id: 'page-1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Настроить доступ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить разрешения.');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(state.permissionsQuery.refetch).toHaveBeenCalled();
  });
});
