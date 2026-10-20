import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageCapabilities } from '@/entities/page';
import type { PublicationManagementDto } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';
import { PublicationManagement } from './publication-management';

const PAGE_ID = 'page-1';
const BASE = '*/api/v1/pages/page-1/publication';
const FIRST_PUBLISH = `${BASE}/publish`;
const REPUBLISH = `${BASE}/republish`;
const UNPUBLISH = `${BASE}/unpublish`;
const initialPublishedAt = '2026-10-10T10:00:00.000Z';
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  cleanup();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function publication(overrides: Partial<PublicationManagementDto> = {}): PublicationManagementDto {
  return {
    status: 'published',
    slug: 'team-roadmap',
    seoTitle: 'Roadmap',
    seoDescription: 'Team roadmap',
    publishedAt: initialPublishedAt,
    publicPath: '/p/team-roadmap',
    ...overrides,
  };
}

function renderManagement(canManagePage = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const capabilities = {
    ...getPageCapabilities(canManagePage ? 'editor' : 'viewer'),
    canManagePage,
  };
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<PublicationManagement capabilities={capabilities} pageId={PAGE_ID} />, {
    wrapper: Wrapper,
  });
}

async function openPanel() {
  fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
}

async function fillFirstPublish(slug = 'launch-notes') {
  fireEvent.change(await screen.findByLabelText('Адрес публикации'), {
    target: { value: slug },
  });
  fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'Launch notes' } });
  fireEvent.change(screen.getByLabelText('SEO description'), {
    target: { value: 'Public launch notes' },
  });
}

describe('PublicationManagement', () => {
  it('runs PATCH draft then first Publish and only then shows the public link', async () => {
    const requests: string[] = [];
    let current: PublicationManagementDto | undefined;
    server.use(
      http.get(BASE, () =>
        current
          ? HttpResponse.json(current)
          : HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, async ({ request }) => {
        requests.push('patch');
        const body = (await request.json()) as { slug: string; seoTitle: string | null };
        current = publication({
          status: 'draft',
          slug: body.slug,
          seoTitle: body.seoTitle,
          seoDescription: 'Public launch notes',
          publishedAt: null,
          publicPath: null,
        });
        return HttpResponse.json(current);
      }),
      http.post(FIRST_PUBLISH, async ({ request }) => {
        requests.push('publish');
        const body = (await request.json()) as { slug: string };
        current = publication({
          status: 'published',
          slug: body.slug,
          seoTitle: 'Launch notes',
          seoDescription: 'Public launch notes',
          publicPath: `/p/${body.slug}`,
        });
        return HttpResponse.json(current);
      }),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText('Страница опубликована.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /http:\/\/localhost:3000\/p\/launch-notes/ }),
    ).toHaveAttribute('href', 'http://localhost:3000/p/launch-notes');
    expect(requests).toEqual(['patch', 'publish']);
  });

  it('keeps a saved draft after a confirmed Publish rejection', async () => {
    server.use(
      http.get(BASE, () =>
        HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, () =>
        HttpResponse.json(
          publication({
            status: 'draft',
            publishedAt: null,
            publicPath: null,
            slug: 'launch-notes',
          }),
        ),
      ),
      http.post(FIRST_PUBLISH, () =>
        HttpResponse.json({ message: 'publication_asset_unavailable' }, { status: 409 }),
      ),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByText(/Backend отклонил операцию/)).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /\/p\/launch-notes/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('launch-notes');
  });

  it('shows a confirmed backend validation error while retaining the draft and form values', async () => {
    server.use(
      http.get(BASE, () =>
        HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, () =>
        HttpResponse.json(
          publication({
            status: 'draft',
            publishedAt: null,
            publicPath: null,
            slug: 'launch-notes',
          }),
        ),
      ),
      http.post(FIRST_PUBLISH, () =>
        HttpResponse.json({ message: 'invalid_publication_slug' }, { status: 400 }),
      ),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText(/Backend отклонил операцию\. Проверьте поля/),
    ).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('launch-notes');
  });

  it('updates slug and SEO metadata without invoking Republish', async () => {
    const current = publication();
    let republishCalls = 0;
    server.use(
      http.get(BASE, () => HttpResponse.json(current)),
      http.patch(BASE, async ({ request }) => {
        const body = (await request.json()) as {
          slug: string;
          seoTitle: string | null;
          seoDescription: string | null;
        };
        return HttpResponse.json(
          publication({ ...current, ...body, publicPath: `/p/${body.slug}` }),
        );
      }),
      http.post(REPUBLISH, () => {
        republishCalls += 1;
        return HttpResponse.json(publication());
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.change(await screen.findByLabelText('Адрес публикации'), {
      target: { value: 'new-address' },
    });
    fireEvent.change(screen.getByLabelText('SEO title'), { target: { value: 'New SEO title' } });
    fireEvent.change(screen.getByLabelText('SEO description'), {
      target: { value: 'New SEO description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));

    expect(await screen.findByText('Настройки публикации сохранены.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/p\/new-address/ })).toHaveAttribute(
      'href',
      'http://localhost:3000/p/new-address',
    );
    expect(republishCalls).toBe(0);
  });

  it('shows slug conflict in the form and preserves the entered value', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json(publication())),
      http.patch(BASE, () =>
        HttpResponse.json({ message: 'publication_slug_conflict' }, { status: 409 }),
      ),
    );

    renderManagement();
    await openPanel();
    const slugInput = await screen.findByLabelText('Адрес публикации');
    fireEvent.change(slugInput, { target: { value: 'taken-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));

    expect(await screen.findByText('Этот адрес уже занят.')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('taken-address');
  });

  it('validates slug locally and does not send a mutation', async () => {
    const patchRequest = vi.fn();
    server.use(
      http.get(BASE, () =>
        HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, () => {
        patchRequest();
        return HttpResponse.json(
          publication({ status: 'draft', publishedAt: null, publicPath: null }),
        );
      }),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish('not a slug');
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText('Используйте латинские буквы, цифры и дефисы.'),
    ).toBeInTheDocument();
    expect(patchRequest).not.toHaveBeenCalled();
  });

  it('does not interpret an unrelated 404 as an unpublished page', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ message: 'page_not_found' }, { status: 404 })),
    );

    renderManagement();
    await openPanel();

    expect(
      await screen.findByText('Не удалось загрузить состояние публикации.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
  });

  it('blocks competing commands while a mutation is pending', async () => {
    let patchCalls = 0;
    let releasePatch: (() => void) | undefined;
    server.use(
      http.get(BASE, () =>
        HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, async () => {
        patchCalls += 1;
        await new Promise<void>((resolve) => {
          releasePatch = resolve;
        });
        return HttpResponse.json(
          publication({
            status: 'draft',
            publishedAt: null,
            publicPath: null,
            slug: 'launch-notes',
          }),
        );
      }),
      http.post(FIRST_PUBLISH, () => HttpResponse.json(publication({ slug: 'launch-notes' }))),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    const publishButton = screen.getByRole('button', { name: 'Опубликовать' });
    fireEvent.click(publishButton);
    await waitFor(() => expect(patchCalls).toBe(1));
    expect(publishButton).toBeDisabled();
    fireEvent.click(publishButton);
    releasePatch?.();

    expect(await screen.findByText('Страница опубликована.')).toBeInTheDocument();
    expect(patchCalls).toBe(1);
  });

  it('copies the confirmed public URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    server.use(http.get(BASE, () => HttpResponse.json(publication())));

    renderManagement();
    await openPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Копировать' }));

    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/p/team-roadmap');
    expect(await screen.findByText('Публичная ссылка скопирована.')).toBeInTheDocument();
  });

  it('reconciles a lost first Publish response with a confirmed backend GET', async () => {
    let current: PublicationManagementDto | undefined;
    server.use(
      http.get(BASE, () =>
        current
          ? HttpResponse.json(current)
          : HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, () =>
        HttpResponse.json(
          publication({
            status: 'draft',
            slug: 'launch-notes',
            publishedAt: null,
            publicPath: null,
          }),
        ),
      ),
      http.post(FIRST_PUBLISH, () => {
        current = publication({ slug: 'launch-notes', publicPath: '/p/launch-notes' });
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText('Публикация подтверждена по состоянию backend.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/p\/launch-notes/ })).toBeInTheDocument();
  });

  it('keeps first Publish uncertain when the status GET still shows the saved draft', async () => {
    let current: PublicationManagementDto | undefined;
    let publishCalls = 0;
    server.use(
      http.get(BASE, () =>
        current
          ? HttpResponse.json(current)
          : HttpResponse.json({ message: 'publication_not_found' }, { status: 404 }),
      ),
      http.patch(BASE, () => {
        current = publication({
          status: 'draft',
          slug: 'launch-notes',
          publishedAt: null,
          publicPath: null,
        });
        return HttpResponse.json(current);
      }),
      http.post(FIRST_PUBLISH, () => {
        publishCalls += 1;
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    await fillFirstPublish();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(
      await screen.findByText(/Не удалось подтвердить результат публикации/),
    ).toBeInTheDocument();
    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /\/p\/launch-notes/ })).not.toBeInTheDocument();
    expect(publishCalls).toBe(1);
  });

  it('confirms metadata-only PATCH from GET after losing the response', async () => {
    let current = publication();
    server.use(
      http.get(BASE, () => HttpResponse.json(current)),
      http.patch(BASE, async ({ request }) => {
        const body = (await request.json()) as {
          slug: string;
          seoTitle: string | null;
          seoDescription: string | null;
        };
        current = publication({ ...current, ...body, publicPath: `/p/${body.slug}` });
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.change(await screen.findByLabelText('Адрес публикации'), {
      target: { value: 'saved-metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));

    expect(
      await screen.findByText('Настройки подтверждены по состоянию backend.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/p\/saved-metadata/ })).toBeInTheDocument();
  });

  it('keeps Republish uncertain when status is published but publishedAt did not change', async () => {
    let republishCalls = 0;
    server.use(
      http.get(BASE, () => HttpResponse.json(publication())),
      http.post(REPUBLISH, () => {
        republishCalls += 1;
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));

    expect(
      await screen.findByText(/Не удалось определить, создана ли новая версия/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Republish' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить состояние' }));
    await waitFor(() => expect(republishCalls).toBe(1));
    expect(
      await screen.findByText(/Состояние обновлено, но результат операции пока нельзя подтвердить/),
    ).toBeInTheDocument();
    expect(republishCalls).toBe(1);
  });

  it('confirms successful Republish only after the backend returns the new version', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json(publication())),
      http.post(REPUBLISH, () =>
        HttpResponse.json(publication({ publishedAt: '2026-10-11T10:00:00.000Z' })),
      ),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));

    expect(await screen.findByText('Новая опубликованная версия создана.')).toBeInTheDocument();
  });

  it('confirms a lost Republish response only when backend publishedAt changed', async () => {
    let current = publication();
    server.use(
      http.get(BASE, () => HttpResponse.json(current)),
      http.post(REPUBLISH, () => {
        current = publication({ publishedAt: '2026-10-11T10:00:00.000Z' });
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));

    expect(
      await screen.findByText('Новая версия подтверждена по времени публикации.'),
    ).toBeInTheDocument();
  });

  it('preserves the existing public version after a confirmed Republish rejection', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json(publication())),
      http.post(REPUBLISH, () =>
        HttpResponse.json({ message: 'publication_asset_unavailable' }, { status: 409 }),
      ),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Republish' }));

    expect(
      await screen.findByText(/Backend отклонил операцию из-за текущего состояния/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\/p\/team-roadmap/ })).toBeInTheDocument();
  });

  it('uses Republish for an unpublished record', async () => {
    let publishCalls = 0;
    let republishCalls = 0;
    server.use(
      http.get(BASE, () =>
        HttpResponse.json(publication({ status: 'unpublished', publicPath: null })),
      ),
      http.post(FIRST_PUBLISH, () => {
        publishCalls += 1;
        return HttpResponse.json(publication());
      }),
      http.post(REPUBLISH, () => {
        republishCalls += 1;
        return HttpResponse.json(publication());
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать снова' }));

    expect(await screen.findByText('Новая опубликованная версия создана.')).toBeInTheDocument();
    expect(republishCalls).toBe(1);
    expect(publishCalls).toBe(0);
  });

  it('confirms Unpublish after a lost response and hides the public link', async () => {
    let current = publication();
    server.use(
      http.get(BASE, () => HttpResponse.json(current)),
      http.post(UNPUBLISH, () => {
        current = publication({ status: 'unpublished', publicPath: null });
        return HttpResponse.error();
      }),
    );

    renderManagement();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Снять с публикации' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Подтвердить снятие' }));

    expect(
      await screen.findByText('Снятие публикации подтверждено по состоянию backend.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Снята с публикации')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /\/p\/team-roadmap/ })).not.toBeInTheDocument();
  });

  it('does not show publication controls to a viewer', () => {
    renderManagement(false);
    expect(screen.queryByRole('button', { name: 'Публикация' })).not.toBeInTheDocument();
  });

  it('keeps the editor controls local and reports backend permission denial', async () => {
    server.use(http.get(BASE, () => HttpResponse.json({ message: 'forbidden' }, { status: 403 })));

    renderManagement();
    await openPanel();

    expect(
      await screen.findByText('Не удалось загрузить состояние публикации.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Публикация' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
  });

  it('treats authentication expiry as an error rather than an unpublished page', async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ message: 'unauthorized' }, { status: 401 })),
    );

    renderManagement();
    await openPanel();

    expect(
      await screen.findByText('Не удалось загрузить состояние публикации.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
  });
});
