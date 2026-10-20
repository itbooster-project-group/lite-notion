import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPageCapabilities, type NormalizedPage } from '@/entities/page';
import type { PublicationManagementDto } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';
import type { WorkspaceMainProps } from './workspace-main';
import { WorkspaceMain } from './workspace-main';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./collaborative-page-editor', () => ({
  CollaborativePageEditor: () => <div data-testid="collaborative-editor" />,
}));
vi.mock('./page-cover', () => ({ PageCover: () => null }));

const PAGE_A = 'page-a';
const PAGE_B = 'page-b';
const PAGE_A_PUBLICATION: PublicationManagementDto = {
  status: 'published',
  slug: 'page-a-slug',
  seoTitle: 'Page A',
  seoDescription: null,
  publishedAt: '2026-10-10T10:00:00.000Z',
  publicPath: '/p/page-a-slug',
};

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  cleanup();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function page(id: string): NormalizedPage {
  return {
    id,
    ownerId: 'owner-1',
    projectId: 'project-1',
    parentPageId: null,
    coverAssetId: null,
    createdById: 'owner-1',
    title: id,
    position: 'a0',
    accessMode: 'inherit',
    accessRole: 'editor',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  };
}

function props(activePage: NormalizedPage): WorkspaceMainProps {
  return {
    activePageId: activePage.id,
    activePage,
    pageCapabilities: getPageCapabilities('editor'),
    normalizedTree: {
      nodesById: { [activePage.id]: activePage },
      parentIdById: { [activePage.id]: null },
      childIdsByParentId: { [activePage.id]: [] },
      rootIdsByProjectId: { 'project-1': [activePage.id] },
    },
    onCreatePage: vi.fn(async () => {}),
    onMovePage: vi.fn(async () => {}),
    onRenamePage: vi.fn(async () => {}),
    onRequestDeletePage: vi.fn(),
    projectTree: { projectId: 'project-1', rootItemId: 'project-root:project-1', items: {} },
    projectName: 'Project',
  };
}

function renderWorkspace(activePage: NormalizedPage) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const view = render(<WorkspaceMain {...props(activePage)} />, { wrapper: Wrapper });
  return { ...view, queryClient };
}

function publicationHandler() {
  return http.get('*/api/v1/pages/:pageId/publication', ({ params }) => {
    if (params.pageId === PAGE_A) return HttpResponse.json(PAGE_A_PUBLICATION);
    return HttpResponse.json({ message: 'publication_not_found' }, { status: 404 });
  });
}

describe('WorkspaceMain publication state isolation', () => {
  it('does not carry publication, URL, feedback, or form values to another page', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    server.use(publicationHandler());
    const view = renderWorkspace(page(PAGE_A));

    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Копировать' }));
    expect(await screen.findByText('Публичная ссылка скопирована.')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('page-a-slug');

    view.rerender(<WorkspaceMain {...props(page(PAGE_B))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));

    expect(await screen.findByText('Не опубликована')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('');
    expect(screen.queryByText('Публичная ссылка скопирована.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /page-a-slug/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Опубликована')).not.toBeInTheDocument();
    view.queryClient.clear();
  });

  it('keeps a pending page A republish from changing page B after navigation', async () => {
    let finishRepublish: ((response: Response) => void) | undefined;
    let markRepublishCompleted: (() => void) | undefined;
    const republishCompleted = new Promise<void>((resolve) => {
      markRepublishCompleted = resolve;
    });
    server.use(
      publicationHandler(),
      http.post('*/api/v1/pages/:pageId/publication/republish', async ({ params }) => {
        if (params.pageId === PAGE_A) {
          const response = await new Promise<Response>((resolve) => {
            finishRepublish = resolve;
          });
          markRepublishCompleted?.();
          return response;
        }
        return HttpResponse.json({ message: 'publication_not_found' }, { status: 404 });
      }),
    );
    const view = renderWorkspace(page(PAGE_A));

    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
    const republish = await screen.findByRole('button', { name: 'Republish' });
    fireEvent.click(republish);
    await waitFor(() => expect(republish).toBeDisabled());

    view.rerender(<WorkspaceMain {...props(page(PAGE_B))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
    expect(await screen.findByText('Не опубликована')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeEnabled();
    expect(screen.queryByText('page-a-slug')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Republish/ })).not.toBeInTheDocument();

    await act(async () => {
      finishRepublish?.(
        HttpResponse.json({
          ...PAGE_A_PUBLICATION,
          publishedAt: '2026-10-11T10:00:00.000Z',
        }),
      );
      await republishCompleted;
    });
    expect(screen.getByText('Не опубликована')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /page-a-slug/ })).not.toBeInTheDocument();
    view.queryClient.clear();
  });

  it('does not render a late publication status response for page A on page B', async () => {
    let finishPageARead: ((response: Response) => void) | undefined;
    server.use(
      http.get('*/api/v1/pages/:pageId/publication', async ({ params }) => {
        if (params.pageId === PAGE_A) {
          return await new Promise<Response>((resolve) => {
            finishPageARead = resolve;
          });
        }
        return HttpResponse.json({ message: 'publication_not_found' }, { status: 404 });
      }),
    );
    const view = renderWorkspace(page(PAGE_A));

    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
    expect(await screen.findByText('Загружаем состояние публикации…')).toBeInTheDocument();

    view.rerender(<WorkspaceMain {...props(page(PAGE_B))} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Публикация' }));
    expect(await screen.findByText('Не опубликована')).toBeInTheDocument();

    await act(async () => finishPageARead?.(HttpResponse.json(PAGE_A_PUBLICATION)));
    expect(screen.getByText('Не опубликована')).toBeInTheDocument();
    expect(screen.getByLabelText('Адрес публикации')).toHaveValue('');
    expect(screen.queryByRole('link', { name: /page-a-slug/ })).not.toBeInTheDocument();
    view.queryClient.clear();
  });
});
