import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '@/entities/session';
import type { PageDto } from '@/shared/api';
import * as api from '@/shared/api';
import { server } from '@/shared/api/mocks/server';
import { PageCover } from './page-cover';

const page: PageDto = {
  accessMode: 'inherit',
  accessRole: 'owner',
  coverAssetId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdById: 'user-1',
  id: 'page-1',
  ownerId: 'user-1',
  parentPageId: null,
  position: 'V',
  projectId: 'project-1',
  title: 'Page',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  server.use(
    http.post('*/api/v1/auth/refresh', () =>
      HttpResponse.json({ accessToken: 'token', expiresIn: 900 }),
    ),
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'ada@example.com',
        name: 'Ada',
        avatarAssetId: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCover(value: PageDto, placement: 'banner' | 'inline' = 'banner') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <PageCover page={value} placement={placement} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

describe('PageCover', () => {
  it('does not render an empty banner or cover actions for a viewer', () => {
    renderCover({ ...page, accessRole: 'viewer', coverAssetId: null }, 'inline');

    expect(screen.queryByRole('region', { name: 'Обложка страницы' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить обложку' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить обложку' })).not.toBeInTheDocument();
  });

  it.each(['owner', 'editor'] as const)(
    'shows compact add action and upload input to %s',
    (accessRole) => {
      renderCover({ ...page, accessRole }, 'inline');

      expect(screen.getByRole('button', { name: 'Добавить обложку' })).toBeInTheDocument();
      expect(screen.getByLabelText('Загрузить изображение обложки')).toHaveClass('sr-only');
      expect(screen.queryByRole('img', { name: 'Обложка недоступна' })).not.toBeInTheDocument();
    },
  );

  it.each(['owner', 'editor'] as const)('shows cover menu actions to %s', (accessRole) => {
    renderCover({ ...page, accessRole, coverAssetId: '22222222-2222-4222-8222-222222222222' });

    fireEvent.click(screen.getByRole('button', { name: 'Изменить обложку' }));
    expect(screen.getByRole('menuitem', { name: 'Загрузить изображение' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Удалить обложку' })).toBeInTheDocument();
  });

  it('does not show cover menu actions to a viewer', () => {
    renderCover({
      ...page,
      accessRole: 'viewer',
      coverAssetId: '22222222-2222-4222-8222-222222222222',
    });

    expect(screen.queryByRole('button', { name: 'Изменить обложку' })).not.toBeInTheDocument();
  });

  it('restores an existing cover from page data after reload', async () => {
    const assetId = '22222222-2222-4222-8222-222222222222';
    const readUrl = vi.spyOn(api, 'createAssetReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/cover.jpg',
      expiresInSeconds: 300,
    });
    renderCover({ ...page, coverAssetId: assetId });

    expect(await screen.findByRole('img', { name: 'Обложка страницы' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/cover.jpg',
    );
    expect(readUrl).toHaveBeenCalledWith(assetId, { pageId: page.id });
  });

  it('keeps the current cover when permission is lost during replacement', async () => {
    const assetId = '22222222-2222-4222-8222-222222222222';
    const initiate = vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId,
      contentPath: `/api/v1/assets/${assetId}/content`,
    });
    const upload = vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: assetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'cover.png',
    });
    const setCover = vi
      .spyOn(api, 'setPageCover')
      .mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    const { queryClient } = renderCover(page, 'inline');
    const pageKey = api.getGetPageQueryKey(page.id);
    queryClient.setQueryData(pageKey, page);
    await screen.findByRole('button', { name: 'Добавить обложку' });
    fireEvent.change(screen.getByLabelText('Загрузить изображение обложки'), {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(setCover).toHaveBeenCalledWith('page-1', { assetId }));
    expect(initiate).toHaveBeenCalledWith({ fileName: 'cover.png', pageId: 'page-1' });
    expect(upload).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent('Текущая обложка сохранена');
    expect(screen.queryByLabelText('Загрузить изображение обложки')).not.toBeInTheDocument();
    expect(queryClient.getQueryState(pageKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it('keeps the visible cover after a failed replacement and allows retrying the reference update', async () => {
    const oldAssetId = '11111111-1111-4111-8111-111111111111';
    const newAssetId = '22222222-2222-4222-8222-222222222222';
    vi.spyOn(api, 'createAssetReadUrl').mockResolvedValue({
      url: 'https://cdn.example.com/old-cover.jpg',
      expiresInSeconds: 300,
    });
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId: newAssetId,
      contentPath: `/api/v1/assets/${newAssetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: newAssetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'new-cover.png',
    });
    const setCover = vi
      .spyOn(api, 'setPageCover')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue(undefined);
    renderCover({ ...page, coverAssetId: oldAssetId });
    const input = await screen.findByLabelText('Загрузить изображение обложки');
    fireEvent.change(input, {
      target: { files: [new File(['png'], 'new-cover.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('img', { name: 'Обложка страницы' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/old-cover.jpg',
    );
    expect(
      await screen.findByRole('button', { name: 'Повторить сохранение обложки' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить сохранение обложки' }));
    await waitFor(() => expect(setCover).toHaveBeenCalledTimes(2));
    expect(setCover).toHaveBeenLastCalledWith(page.id, { assetId: newAssetId });
  });

  it('attaches a confirmed upload and removes the page reference on request', async () => {
    const assetId = '33333333-3333-4333-8333-333333333333';
    vi.spyOn(api, 'initiateAssetUpload').mockResolvedValue({
      assetId,
      contentPath: `/api/v1/assets/${assetId}/content`,
    });
    vi.spyOn(api, 'uploadAssetContentWithProgress').mockResolvedValue({
      id: assetId,
      status: 'ready',
      mimeType: 'image/png',
      sizeBytes: 3,
      originalName: 'cover.png',
    });
    const setCover = vi.spyOn(api, 'setPageCover').mockResolvedValue(undefined);
    const { queryClient, rerender } = renderCover(page, 'inline');
    const coverInput = await screen.findByLabelText('Загрузить изображение обложки');
    fireEvent.change(coverInput, {
      target: { files: [new File(['png'], 'cover.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(setCover).toHaveBeenCalledWith('page-1', { assetId }));
    rerender(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <PageCover page={{ ...page, coverAssetId: assetId }} placement="banner" />
        </SessionProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Изменить обложку' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить обложку' }));
    await waitFor(() => expect(setCover).toHaveBeenLastCalledWith('page-1', { assetId: null }));
    queryClient.clear();
  });
});
