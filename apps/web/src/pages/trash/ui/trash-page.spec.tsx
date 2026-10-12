import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeletedPageTreeNodeDto, DeletedProjectDto, ProjectDto } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';
import { TrashPage } from './trash-page';

const deletedPage: DeletedPageTreeNodeDto = {
  children: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: 'owner',
  deletedAt: '2026-04-02T00:00:00.000Z',
  id: 'deleted-page',
  ownerId: 'owner',
  parentPageId: null,
  position: 'a',
  projectId: 'deleted-project',
  title: 'Deleted page',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const activeProject: ProjectDto = {
  id: 'active-project',
  name: 'Active project',
  ownerId: 'owner',
};
const deletedProject: DeletedProjectDto = {
  deletedAt: '2026-04-01T00:00:00.000Z',
  id: 'deleted-project',
  name: 'Deleted project',
  ownerId: 'owner',
};
const nestedTrash: DeletedPageTreeNodeDto = {
  ...deletedPage,
  children: [
    { ...deletedPage, id: 'nested-page', parentPageId: 'deleted-page', title: 'Nested page' },
  ],
  title: 'Deleted page',
};

function renderTrash({
  projects = [activeProject],
  pageTrash = [deletedPage],
  projectTrash = [deletedProject],
  pageTrashError = false,
}: {
  projects?: ProjectDto[];
  pageTrash?: DeletedPageTreeNodeDto[];
  projectTrash?: DeletedProjectDto[];
  pageTrashError?: boolean;
} = {}) {
  server.use(
    http.get('*/api/v1/projects', () => HttpResponse.json(projects)),
    http.get('*/api/v1/pages/trash', async () => {
      if (pageTrashError) {
        await delay(60);
        return HttpResponse.json({ message: 'Failed' }, { status: 500 });
      }
      return HttpResponse.json(pageTrash);
    }),
    http.get('*/api/v1/projects/trash', () => HttpResponse.json(projectTrash)),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TrashPage />
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(cleanup);

describe('корзина', () => {
  it('показывает загрузку и ошибку, повторяет запрос после retry', async () => {
    renderTrash({ pageTrashError: true });
    expect(screen.getByText('Загружаем страницы корзины…')).toBeInTheDocument();
    expect(await screen.findByText('Не удалось загрузить страницы корзины.')).toBeInTheDocument();
    server.use(http.get('*/api/v1/pages/trash', () => HttpResponse.json([deletedPage])));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Deleted page')).toBeInTheDocument();
  });

  it('показывает вкладки, исходный проект и безопасный fallback, включая состояния загрузки и пустого списка', async () => {
    renderTrash();
    expect(await screen.findByText('Deleted page')).toBeInTheDocument();
    expect(screen.getByText('Проект: Deleted project')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Проекты' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Deleted project');
    fireEvent.click(screen.getByRole('tab', { name: 'Страницы' }));
    cleanup();
    renderTrash({ projects: [], projectTrash: [], pageTrash: [] });
    fireEvent.click(await screen.findByRole('tab', { name: 'Проекты' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('В корзине нет проектов.');
    cleanup();
    renderTrash({ projects: [], projectTrash: [], pageTrash: [deletedPage] });
    expect(await screen.findByText('Проект: Исходный проект недоступен')).toBeInTheDocument();
  });

  it('показывает действия строки иконками с доступными названиями', async () => {
    renderTrash();

    const restore = await screen.findByRole('button', { name: 'Восстановить: Deleted page' });
    const purge = screen.getByRole('button', { name: 'Удалить навсегда: Deleted page' });

    expect(restore).toHaveClass('size-6');
    expect(purge).toHaveClass('size-6');
    expect(restore).not.toHaveTextContent('Восстановить');
    expect(purge).not.toHaveTextContent('Удалить навсегда');
  });

  it('переключает вкладки клавиатурой', async () => {
    renderTrash();
    const pagesTab = await screen.findByRole('tab', { name: 'Страницы' });
    pagesTab.focus();
    fireEvent.keyDown(pagesTab, { key: 'ArrowRight' });
    const projectsTab = screen.getByRole('tab', { name: 'Проекты' });
    expect(projectsTab).toHaveAttribute('aria-selected', 'true');
    expect(projectsTab).toHaveFocus();
  });

  it('не отправляет restore из удалённого проекта без активной цели и предлагает выбрать цель', async () => {
    const restoreRequest = vi.fn();
    server.use(
      http.post('*/api/v1/pages/:pageId/restore', async ({ request }) => {
        restoreRequest(await request.json());
        return HttpResponse.json({ ...deletedPage, projectId: 'active-project' });
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить: Deleted page' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Исходный проект удалён. Выберите активный проект');
    expect(restoreRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('combobox', { name: 'Целевой проект' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Active project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }));
    await waitFor(() =>
      expect(restoreRequest).toHaveBeenCalledWith({ projectId: 'active-project' }),
    );
  });

  it('восстанавливает страницу в активный исходный проект без выбора назначения', async () => {
    const restoreRequest = vi.fn();
    server.use(
      http.post('*/api/v1/pages/:pageId/restore', async ({ request }) => {
        restoreRequest(await request.text());
        return HttpResponse.json({ ...deletedPage, projectId: 'active-project' });
      }),
    );
    renderTrash({ pageTrash: [{ ...deletedPage, projectId: 'active-project' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить: Deleted page' }));
    expect(screen.queryByRole('combobox', { name: 'Целевой проект' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await waitFor(() => expect(restoreRequest).toHaveBeenCalledTimes(1));
  });

  it('восстанавливает выбранный проект отдельным запросом', async () => {
    const restoredProject = vi.fn();
    server.use(
      http.post('*/api/v1/projects/:projectId/restore', ({ params }) => {
        restoredProject(params.projectId);
        return HttpResponse.json(activeProject);
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('tab', { name: 'Проекты' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить: Deleted project' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await waitFor(() => expect(restoredProject).toHaveBeenCalledWith('deleted-project'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('показывает pending и ошибку restore, оставляя выбранный элемент доступным для повтора', async () => {
    server.use(
      http.post('*/api/v1/pages/:pageId/restore', async () => {
        await delay(60);
        return HttpResponse.json({ message: 'Restore failed' }, { status: 500 });
      }),
    );
    renderTrash({ pageTrash: [{ ...deletedPage, projectId: 'active-project' }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить: Deleted page' }));
    const restore = await screen.findByRole('button', { name: 'Восстановить' });
    fireEvent.click(restore);
    await waitFor(() => expect(restore).toHaveAttribute('aria-disabled', 'true'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось восстановить элемент');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('не отправляет restore страницы, если активных проектов нет', async () => {
    const restoreRequest = vi.fn();
    server.use(
      http.post('*/api/v1/pages/:pageId/restore', () => {
        restoreRequest();
        return HttpResponse.json({});
      }),
    );
    renderTrash({ projects: [], projectTrash: [] });
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить: Deleted page' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Для восстановления страницы нужен активный проект');
    expect(screen.getByRole('button', { name: 'Восстановить' })).toBeDisabled();
    expect(restoreRequest).not.toHaveBeenCalled();
  });

  it('даёт отдельное действие вложенному узлу и адресует restore выбранному id', async () => {
    const restoreRequest = vi.fn();
    let remainingTrash = [nestedTrash];
    server.use(
      http.post('*/api/v1/pages/:pageId/restore', ({ params }) => {
        restoreRequest(params.pageId);
        remainingTrash = [{ ...nestedTrash, children: [] }];
        return HttpResponse.json({ ...deletedPage, id: String(params.pageId) });
      }),
    );
    renderTrash({ pageTrash: [nestedTrash] });
    server.use(http.get('*/api/v1/pages/trash', () => HttpResponse.json(remainingTrash)));
    expect(await screen.findByText('Nested page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Восстановить: Nested page' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Целевой проект' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Active project' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }));
    await waitFor(() => expect(restoreRequest).toHaveBeenCalledWith('nested-page'));
    expect(await screen.findByText('Deleted page')).toBeInTheDocument();
    expect(screen.queryByText('Nested page')).not.toBeInTheDocument();
  });

  it('при valid 409 разделяет пояснение и названия, отправляет cascade только после второго подтверждения', async () => {
    const requests: string[] = [];
    server.use(
      http.delete('*/api/v1/pages/trash/:pageId', ({ request }) => {
        requests.push(new URL(request.url).search);
        if (requests.length === 1) {
          return HttpResponse.json(
            {
              error: 'Conflict',
              path: '/api/v1/pages/trash/deleted-page',
              statusCode: 409,
              timestamp: 'now',
              message: ['В поддереве есть отдельно удалённые страницы.', 'Independent child', ''],
            },
            { status: 409 },
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда: Deleted page' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('В поддереве есть отдельно удалённые страницы.');
    expect(dialog).toHaveTextContent('Independent child');
    expect(dialog).toHaveTextContent('Без названия');
    expect(requests).toEqual(['']);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(requests).toEqual(['']);
  });

  it('не повторяет purge с cascade для некорректного 409', async () => {
    const requests: string[] = [];
    server.use(
      http.delete('*/api/v1/pages/trash/:pageId', ({ request }) => {
        requests.push(new URL(request.url).search);
        return new HttpResponse('unrecognized shape', { status: 409 });
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда: Deleted page' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить элемент');
    expect(requests).toEqual(['']);
  });

  it('блокирует повторное destructive submit во время pending', async () => {
    server.use(
      http.delete('*/api/v1/pages/trash/:pageId', async () => {
        await delay(100);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда: Deleted page' }));
    const confirm = await screen.findByRole('button', { name: 'Удалить навсегда' });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('повторяет индивидуальный purge с cascade только после явного подтверждения', async () => {
    const requests: string[] = [];
    server.use(
      http.delete('*/api/v1/pages/trash/:pageId', ({ request }) => {
        requests.push(new URL(request.url).search);
        if (requests.length === 1) {
          return HttpResponse.json(
            {
              error: 'Conflict',
              path: '/api/v1/pages/trash/deleted-page',
              statusCode: 409,
              timestamp: 'now',
              message: ['В поддереве есть самостоятельно удалённая страница.', 'Independent child'],
            },
            { status: 409 },
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTrash();
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда: Deleted page' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить навсегда' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить каскадно' }));
    await waitFor(() => expect(requests).toEqual(['', '?cascade=true']));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
