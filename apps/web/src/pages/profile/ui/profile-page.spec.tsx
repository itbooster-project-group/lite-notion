import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/entities/session';
import * as api from '@/shared/api';
import { AssetUploadError, clearAccessToken } from '@/shared/api';
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
  vi.restoreAllMocks();
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
    expect(screen.getByRole('img', { name: 'Нет аватара' })).toHaveTextContent('A');
    expect(screen.getByRole('button', { name: 'Загрузить аватар' })).toBeInTheDocument();
    expect(screen.getByLabelText('Выбрать изображение аватара')).toHaveClass('sr-only');
    expect(screen.getByLabelText('Выбрать изображение аватара')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Имя')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('Дата регистрации')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.queryByText(user.id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /сохран/i })).not.toBeInTheDocument();
  });

  it('заменяет и удаляет аватар только после ready и сохраняет fallback контракт', async () => {
    let avatarAssetId: string | null = 'old-asset';
    const nextAssetId = '22222222-2222-4222-8222-222222222222';
    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ ...user, avatarAssetId })));
    vi.spyOn(api, 'createAvatarReadUrl').mockImplementation(async (_userId, assetId) => ({
      url: `https://cdn.example.com/${assetId}.jpg`,
      expiresInSeconds: 300,
    }));
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: nextAssetId,
      contentPath: `/api/v1/assets/${nextAssetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: nextAssetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'avatar.png',
    });
    const setAvatar = vi
      .spyOn(api, 'setCurrentUserAvatar')
      .mockImplementation(async ({ assetId }) => {
        avatarAssetId = assetId ?? null;
      });
    renderWithSession(<ProfilePage />);
    expect(await screen.findByRole('img', { name: 'Ada: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/old-asset.jpg',
    );

    expect(await screen.findByRole('button', { name: 'Действия с аватаром' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Действия с аватаром' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Заменить аватар' }));
    fireEvent.change(screen.getByLabelText('Выбрать изображение аватара'), {
      target: { files: [new File(['png'], 'avatar.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(setAvatar).toHaveBeenCalledWith({ assetId: nextAssetId }));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Ada: аватар' })).toHaveAttribute(
        'src',
        `https://cdn.example.com/${nextAssetId}.jpg`,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Действия с аватаром' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить аватар' }));
    await waitFor(() => expect(setAvatar).toHaveBeenLastCalledWith({ assetId: null }));
    expect(await screen.findByRole('img', { name: 'Нет аватара' })).toBeInTheDocument();
  });

  it('сохраняет прежний аватар при отказе backend на замену', async () => {
    const nextAssetId = '22222222-2222-4222-8222-222222222222';
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: nextAssetId,
      contentPath: `/api/v1/assets/${nextAssetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: nextAssetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'avatar.png',
    });
    const setAvatar = vi
      .spyOn(api, 'setCurrentUserAvatar')
      .mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ ...user, avatarAssetId: 'old-asset' }),
      ),
    );
    vi.spyOn(api, 'createAvatarReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/old-asset.jpg',
      expiresInSeconds: 300,
    });
    renderWithSession(<ProfilePage />);
    fireEvent.change(await screen.findByLabelText('Выбрать изображение аватара'), {
      target: { files: [new File(['png'], 'avatar.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(setAvatar).toHaveBeenCalledOnce());
    expect(await screen.findByRole('alert')).toHaveTextContent('Текущий аватар сохранён');
    expect(screen.queryByRole('img', { name: 'Нет аватара' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ada: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/old-asset.jpg',
    );
  });

  it('сохраняет старый аватар и показывает состояние загрузки при замене', async () => {
    const nextAssetId = '22222222-2222-4222-8222-222222222222';
    let resolveUpload:
      | ((value: Awaited<ReturnType<typeof api.uploadAssetContentWithProgress>>) => void)
      | undefined;
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: nextAssetId,
      contentPath: `/api/v1/assets/${nextAssetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ ...user, avatarAssetId: 'old-asset' }),
      ),
    );
    vi.spyOn(api, 'createAvatarReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/old-asset.jpg',
      expiresInSeconds: 300,
    });
    const setAvatar = vi.spyOn(api, 'setCurrentUserAvatar').mockResolvedValue(undefined);
    renderWithSession(<ProfilePage />);

    await screen.findByRole('img', { name: 'Ada: аватар' });
    fireEvent.change(screen.getByLabelText('Выбрать изображение аватара'), {
      target: { files: [new File(['png'], 'avatar.png', { type: 'image/png' })] },
    });

    expect(
      await screen.findByRole('progressbar', { name: 'Загрузка аватара' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ada: аватар' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/old-asset.jpg',
    );
    expect(screen.getByRole('button', { name: 'Действия с аватаром' })).toBeDisabled();
    expect(screen.getByLabelText('Выбрать изображение аватара')).toBeDisabled();

    resolveUpload?.({
      id: nextAssetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'avatar.png',
    });
    await waitFor(() => expect(setAvatar).toHaveBeenCalledWith({ assetId: nextAssetId }));
  });

  it('показывает сохранение как indeterminate status после завершения передачи файла', async () => {
    const nextAssetId = '22222222-2222-4222-8222-222222222222';
    let resolveAssignment: (() => void) | undefined;
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: nextAssetId,
      contentPath: `/api/v1/assets/${nextAssetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: nextAssetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'avatar.png',
    });
    vi.spyOn(api, 'setCurrentUserAvatar').mockImplementation(
      () => new Promise((resolve) => (resolveAssignment = resolve)),
    );
    renderWithSession(<ProfilePage />);

    fireEvent.change(await screen.findByLabelText('Выбрать изображение аватара'), {
      target: { files: [new File(['png'], 'avatar.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('status', { name: 'Сохраняем аватар' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    resolveAssignment?.();
  });

  it('clears the previous pending asset when a different file upload fails', async () => {
    const firstAssetId = '22222222-2222-4222-8222-222222222222';
    const secondAssetId = '33333333-3333-4333-8333-333333333333';
    vi.spyOn(api, 'initiateAssetUpload')
      .mockResolvedValueOnce({
        assetId: firstAssetId,
        contentPath: `/api/v1/assets/${firstAssetId}/content`,
      })
      .mockResolvedValueOnce({
        assetId: secondAssetId,
        contentPath: `/api/v1/assets/${secondAssetId}/content`,
      });
    vi.spyOn(api, 'uploadAssetContentWithProgress')
      .mockResolvedValueOnce({
        id: firstAssetId,
        status: 'ready',
        mimeType: 'image/png',
        sizeBytes: 3,
        originalName: 'first.png',
      })
      .mockRejectedValueOnce(new AssetUploadError('failed', 500));
    const setAvatar = vi
      .spyOn(api, 'setCurrentUserAvatar')
      .mockRejectedValue(Object.assign(new Error('server error'), { status: 500 }));
    renderWithSession(<ProfilePage />);
    const fileInput = await screen.findByLabelText('Выбрать изображение аватара');

    fireEvent.change(fileInput, {
      target: { files: [new File(['first'], 'first.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(setAvatar).toHaveBeenCalledWith({ assetId: firstAssetId }));
    expect(
      await screen.findByRole('button', { name: 'Повторить сохранение аватара' }),
    ).toBeInTheDocument();

    fireEvent.change(fileInput, {
      target: { files: [new File(['second'], 'second.png', { type: 'image/png' })] },
    });

    await screen.findByRole('button', { name: 'Повторить загрузку' });
    expect(
      screen.queryByRole('button', { name: 'Повторить сохранение аватара' }),
    ).not.toBeInTheDocument();
    expect(setAvatar).toHaveBeenCalledOnce();
  });

  it('uses initials when the selected avatar asset cannot be read', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ ...user, avatarAssetId: 'old-asset' }),
      ),
    );
    vi.spyOn(api, 'createAvatarReadUrl').mockRejectedValue(
      Object.assign(new Error('forbidden'), { status: 403 }),
    );
    renderWithSession(<ProfilePage />);

    expect(await screen.findByRole('img', { name: 'Нет аватара' })).toHaveTextContent('A');
    expect(screen.queryByRole('img', { name: 'Ada: аватар' })).not.toBeInTheDocument();
  });
});
