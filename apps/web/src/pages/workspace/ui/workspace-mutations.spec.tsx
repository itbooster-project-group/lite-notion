import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageDto, PageTreeNodeDto } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { WorkspacePage } from './workspace-page';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
}));

function page(
  id: string,
  parentPageId: string | null,
  title: string,
  children: PageTreeNodeDto[] = [],
): PageTreeNodeDto {
  return {
    children,
    createdAt: '2026-08-29T00:00:00.000Z',
    createdById: 'user-1',
    id,
    ownerId: 'user-1',
    parentPageId,
    position: id,
    projectId: 'project-a',
    title,
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function asPageDto(node: PageTreeNodeDto): PageDto {
  const { children: _children, ...dto } = node;
  return dto;
}

let currentTree: PageTreeNodeDto[];

beforeEach(() => {
  currentTree = [
    page('alpha', null, 'Alpha page', [page('child', 'alpha', 'Child page')]),
    page('beta', null, 'Beta page'),
  ];
  server.use(
    http.get('*/api/v1/projects', () =>
      HttpResponse.json([{ id: 'project-a', name: 'Project Alpha', ownerId: 'user-1' }]),
    ),
    http.get('*/api/v1/pages', () => HttpResponse.json(currentTree)),
  );
});

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePage route={{ pageId: 'child', type: 'page' }} />
    </QueryClientProvider>,
  );
}

describe('workspace mutation orchestration', () => {
  it('создаёт child из server response, обновляет cache и открывает полученный id', async () => {
    const requestBody = vi.fn();
    server.use(
      http.post('*/api/v1/pages', async ({ request }) => {
        requestBody(await request.json());
        return HttpResponse.json(asPageDto(page('created', 'alpha', 'Created child')), {
          status: 201,
        });
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(screen.getByRole('button', { name: 'Действия для Alpha page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Добавить дочернюю' }));
    const input = screen.getByRole('textbox', { name: 'Название новой страницы' });
    fireEvent.change(input, { target: { value: 'Created child' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(requestBody).toHaveBeenCalledWith({
        parentPageId: 'alpha',
        projectId: 'project-a',
        title: 'Created child',
      }),
    );
    expect(await screen.findByText('Created child')).toBeInTheDocument();
    expect(navigation.push).toHaveBeenCalledWith('/pages/created');
  });

  it('optimistic move использует общий cache, сохраняет active page и сверяется с сервером', async () => {
    const requestBody = vi.fn();
    server.use(
      http.post('*/api/v1/pages/:pageId/move', async ({ params, request }) => {
        expect(params.pageId).toBe('child');
        requestBody(await request.json());
        currentTree = [
          page('alpha', null, 'Alpha page'),
          page('child', null, 'Child page'),
          page('beta', null, 'Beta page'),
        ];
        await delay(30);
        const movedPage = currentTree[1];
        if (!movedPage) return HttpResponse.json({}, { status: 500 });
        return HttpResponse.json(asPageDto(movedPage));
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(screen.getByRole('button', { name: 'Действия для Child page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переместить…' }));
    await screen.findByRole('dialog', { name: 'Переместить страницу' });
    fireEvent.change(screen.getByLabelText('Позиция'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));

    expect(
      screen.getByRole('navigation', { hidden: true, name: 'Хлебные крошки' }),
    ).toHaveTextContent('Child page');
    await waitFor(() =>
      expect(requestBody).toHaveBeenCalledWith({
        nextSiblingId: 'beta',
        parentPageId: null,
        previousSiblingId: 'alpha',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { hidden: true, name: 'Хлебные крошки' }),
      ).not.toHaveTextContent('Alpha page'),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Переместить страницу' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('откатывает move целиком после ответа с ошибкой', async () => {
    server.use(
      http.post('*/api/v1/pages/:pageId/move', async () => {
        await delay(30);
        return HttpResponse.json({ message: 'Raw move detail' }, { status: 500 });
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(screen.getByRole('button', { name: 'Действия для Child page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переместить…' }));
    await screen.findByRole('dialog', { name: 'Переместить страницу' });
    fireEvent.change(screen.getByLabelText('Позиция'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));
    expect(
      screen.getByRole('navigation', { hidden: true, name: 'Хлебные крошки' }),
    ).toHaveTextContent('Child page');

    await waitFor(() =>
      expect(
        screen.getByRole('navigation', { hidden: true, name: 'Хлебные крошки' }),
      ).toHaveTextContent('Alpha page/Child page'),
    );
    expect(screen.queryByText('Raw move detail')).not.toBeInTheDocument();
  });
});
