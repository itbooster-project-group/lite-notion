import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageDto, PageTreeNodeDto } from '@/shared/api';
import { server } from '@/shared/api/mocks/server';

import { WorkspacePage, type WorkspaceRouteContext } from './workspace-page';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

function page(
  id: string,
  projectId: string,
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
    projectId,
    title,
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

function asPageDto(node: PageTreeNodeDto): PageDto {
  const { children: _children, ...dto } = node;
  return dto;
}

let currentProjects = [
  { id: 'project-a', name: 'Project Alpha', ownerId: 'user-1' },
  { id: 'project-b', name: 'Project Beta', ownerId: 'user-1' },
];

let currentTree: PageTreeNodeDto[];

beforeEach(() => {
  currentProjects = [
    { id: 'project-a', name: 'Project Alpha', ownerId: 'user-1' },
    { id: 'project-b', name: 'Project Beta', ownerId: 'user-1' },
  ];
  currentTree = [
    page('alpha', 'project-a', null, 'Alpha page', [
      page('child', 'project-a', 'alpha', 'Child page'),
    ]),
    page('beta', 'project-a', null, 'Beta page'),
    page('other', 'project-b', null, 'Other project page'),
  ];
  server.use(
    http.get('*/api/v1/projects', () => HttpResponse.json(currentProjects)),
    http.get('*/api/v1/pages', () => HttpResponse.json(currentTree)),
  );
});

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

function renderWorkspace(route: WorkspaceRouteContext) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePage route={route} />
    </QueryClientProvider>,
  );
}

describe('workspace page', () => {
  it('показывает общее дерево на корневом маршруте и создаёт проект', async () => {
    const createRequests = vi.fn();
    server.use(
      http.post('*/api/v1/projects', async ({ request }) => {
        createRequests(await request.json());
        return HttpResponse.json(
          { id: 'created-project', name: 'Новый проект', ownerId: 'user-1' },
          { status: 201 },
        );
      }),
    );
    renderWorkspace({ type: 'root' });

    expect(await screen.findByRole('heading', { name: 'Проекты', level: 1 })).toBeInTheDocument();
    const projectList = screen.getByRole('list', { name: 'Список проектов' });
    expect(projectList).toBeInTheDocument();
    expect(within(projectList).getByRole('link', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.queryByText('Рабочая область')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Название нового проекта'), {
      target: { value: '  Новый проект  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

    await waitFor(() => expect(createRequests).toHaveBeenCalledWith({ name: 'Новый проект' }));
    expect(navigation.push).toHaveBeenCalledWith('/projects/created-project');
  });

  it('собирает project route, фильтрует дерево и выполняет переходы sidebar', async () => {
    renderWorkspace({ projectId: 'project-a', type: 'project' });

    expect(screen.getByText('Загружаем рабочую область…')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Project Alpha', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findAllByRole('treeitem', { name: 'Alpha page' })).not.toHaveLength(0);
    expect(await screen.findByText('Other project page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('treeitem', { name: 'Project Beta' }));
    expect(navigation.push).toHaveBeenCalledWith('/projects/project-b');

    const betaPage = screen.getAllByRole('treeitem', { name: 'Beta page' }).at(0);
    if (!betaPage) throw new Error('Beta page is unavailable');
    fireEvent.click(betaPage);
    expect(navigation.push).toHaveBeenCalledWith('/pages/beta');
  });

  it('разрешает прямую ссылку страницы и показывает единые breadcrumbs и heading', async () => {
    renderWorkspace({ pageId: 'child', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Child page', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Alpha page/Child page',
    );
    expect(await screen.findByRole('treeitem', { name: 'Child page' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByText('Редактор страницы появится в следующем обновлении.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).toBeNull();
  });

  it('показывает fallback для legacy title во всех представлениях', async () => {
    currentTree = [page('legacy', 'project-a', null, '   ')];
    renderWorkspace({ pageId: 'legacy', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Без названия' })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: 'Без названия' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Без названия',
    );
  });

  it.each([
    { projectId: 'missing', type: 'project' } as const,
    { pageId: 'missing', type: 'page' } as const,
  ])('показывает одинаковое безопасное состояние для отсутствующего route id', async (route) => {
    renderWorkspace(route);

    expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К проектам' })).toHaveAttribute('href', '/');
  });

  it('повторяет загрузку workspace и скрывает детали ответа', async () => {
    let attempts = 0;
    server.use(
      http.get('*/api/v1/pages', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: 'Private database detail' }, { status: 500 })
          : HttpResponse.json(currentTree);
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });

    expect(
      await screen.findByRole('heading', { name: 'Ошибка загрузки рабочей области' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Private database detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
  });

  it('открывает mobile drawer, закрывает его по Escape и возвращает фокус', async () => {
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });
    const trigger = screen.getByRole('button', { name: 'Открыть навигацию' });

    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Навигация' })).toBeInTheDocument();
    expect(screen.queryByText('Навигация по проекту')).not.toBeInTheDocument();
    expect(screen.queryByText('Проекты и страницы рабочей области.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть навигацию' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('создаёт root page одним запросом, обновляет дерево и открывает server id', async () => {
    const createRequests = vi.fn();
    server.use(
      http.post('*/api/v1/pages', async ({ request }) => {
        createRequests(await request.json());
        await delay(30);
        return HttpResponse.json(asPageDto(page('created', 'project-a', null, 'Created page')), {
          status: 201,
        });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    const createPageButton = screen.getAllByRole('button', { name: 'Создать страницу' }).at(-1);
    if (!createPageButton) throw new Error('Create page action is unavailable');
    fireEvent.click(createPageButton);
    const input = screen.getByRole('textbox', { name: 'Название новой страницы' });
    fireEvent.change(input, { target: { value: '  Created page  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(createRequests).toHaveBeenCalledTimes(1));
    expect(createRequests).toHaveBeenCalledWith({
      parentPageId: null,
      projectId: 'project-a',
      title: 'Created page',
    });
    expect(await screen.findAllByRole('treeitem', { name: 'Created page' })).not.toHaveLength(0);
    expect(navigation.push).toHaveBeenCalledWith('/pages/created');
  });

  it('оптимистично переименовывает страницу и синхронизирует heading', async () => {
    server.use(
      http.patch('*/api/v1/pages/:pageId', async ({ params, request }) => {
        expect(params.pageId).toBe('child');
        expect(await request.json()).toEqual({ title: 'Renamed child' });
        currentTree[0] = page('alpha', 'project-a', null, 'Alpha page', [
          page('child', 'project-a', 'alpha', 'Renamed child'),
        ]);
        await delay(30);
        const renamedPage = currentTree[0]?.children[0];
        if (!renamedPage) return HttpResponse.json({}, { status: 500 });
        return HttpResponse.json(asPageDto(renamedPage));
      }),
    );
    renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });
    const item = screen.getByRole('treeitem', { name: 'Child page' });
    item.focus();

    fireEvent.keyDown(item, { code: 'F2', key: 'F2' });
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Renamed child' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    expect(await screen.findByRole('heading', { name: 'Renamed child' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Alpha page/Renamed child',
    );
  });

  it('откатывает rename во всех представлениях и сохраняет draft при ошибке', async () => {
    server.use(
      http.patch('*/api/v1/pages/:pageId', () =>
        HttpResponse.json({ message: 'Raw rename detail' }, { status: 500 }),
      ),
    );
    renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });
    const item = screen.getByRole('treeitem', { name: 'Child page' });
    item.focus();

    fireEvent.keyDown(item, { code: 'F2', key: 'F2' });
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Draft rename' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка переименования страницы');
    expect(screen.getByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Draft rename');
    expect(screen.queryByText('Raw rename detail')).not.toBeInTheDocument();
  });

  it('открывает confirmation страницы с выбранным title и не вызывает DELETE до confirm', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/pages/:pageId', ({ params }) => {
        deleteRequests(params.pageId);
        currentTree = currentTree.filter((pageNode) => pageNode.id !== params.pageId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    const alphaActions = screen.getAllByRole('button', { name: 'Действия для Alpha page' }).at(-1);
    if (!alphaActions) throw new Error('Alpha actions are unavailable');
    fireEvent.click(alphaActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));

    expect(await screen.findByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Страница «Alpha page» и все вложенные страницы будут перемещены в корзину.',
      ),
    ).toBeInTheDocument();
    expect(deleteRequests).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteRequests).not.toHaveBeenCalled();

    const betaActions = screen.getAllByRole('button', { name: 'Действия для Beta page' }).at(-1);
    if (!betaActions) throw new Error('Beta actions are unavailable');
    fireEvent.click(betaActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('beta'));
    await waitFor(() =>
      expect(screen.queryAllByRole('treeitem', { name: 'Beta page' })).toHaveLength(0),
    );
    expect(screen.getAllByRole('treeitem', { name: 'Alpha page' })).not.toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('удаление active page сразу начинает replace-navigation без push', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/pages/:pageId', ({ params }) => {
        deleteRequests(params.pageId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(await screen.findByRole('button', { name: 'Действия для Child page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('child'));
    expect(navigation.replace).toHaveBeenCalledWith('/projects/project-a');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
  });

  it('удаление ancestor active page начинает replace-navigation на project root', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/pages/:pageId', ({ params }) => {
        deleteRequests(params.pageId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });

    const alphaActions = await screen.findAllByRole('button', {
      name: 'Действия для Alpha page',
    });
    const alphaAction = alphaActions.at(0);
    if (!alphaAction) throw new Error('Alpha actions are unavailable');
    fireEvent.click(alphaAction);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('alpha'));
    expect(navigation.replace).toHaveBeenCalledWith('/projects/project-a');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
  });

  it('блокирует duplicate submit и показывает pending state при удалении page', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/pages/:pageId', async ({ params }) => {
        deleteRequests(params.pageId);
        currentTree = currentTree.filter((pageNode) => pageNode.id !== params.pageId);
        await delay(50);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    const betaActions = screen.getAllByRole('button', { name: 'Действия для Beta page' }).at(-1);
    if (!betaActions) throw new Error('Beta actions are unavailable');
    fireEvent.click(betaActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    const pendingButton = await screen.findByRole('button', { name: 'Удаляем…' });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();
    await waitFor(() => expect(deleteRequests).toHaveBeenCalledTimes(1));
    expect(deleteRequests).toHaveBeenCalledWith('beta');
  });

  it('оставляет page и route при ошибке удаления и показывает accessible error', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/pages/:pageId', ({ params }) => {
        deleteRequests(params.pageId);
        return HttpResponse.json({ message: 'Raw delete detail' }, { status: 500 });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    const betaActions = screen.getAllByRole('button', { name: 'Действия для Beta page' }).at(-1);
    if (!betaActions) throw new Error('Beta actions are unavailable');
    fireEvent.click(betaActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ошибка удаления страницы. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('Raw delete detail')).not.toBeInTheDocument();
    expect(screen.getAllByText('Beta page')).not.toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(deleteRequests).toHaveBeenCalledWith('beta');
  });

  it('удаляет project из root card без навигации и с выбранным именем', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        currentProjects = currentProjects.filter((project) => project.id !== params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ type: 'root' });
    expect(await screen.findByRole('heading', { name: 'Проекты' })).toBeInTheDocument();

    const alphaProjectActions = screen
      .getAllByRole('button', { name: 'Действия для проекта Project Alpha' })
      .at(-1);
    if (!alphaProjectActions) throw new Error('Project actions are unavailable');
    fireEvent.click(alphaProjectActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));

    expect(await screen.findByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    expect(
      screen.getByText('Проект «Project Alpha» и все его страницы будут перемещены в корзину.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-a'));
    expect(screen.queryByRole('link', { name: 'Project Alpha' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Project Beta' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('удаляет другой project из navigation без смены текущего route', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        currentProjects = currentProjects.filter((project) => project.id !== params.projectId);
        currentTree = currentTree.filter((pageNode) => pageNode.projectId !== params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Действия для проекта Project Beta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-b'));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Project Beta' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('treeitem', { name: 'Other project page' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('удаление текущего project сразу начинает replace-navigation без push', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        currentProjects = currentProjects.filter((project) => project.id !== params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    fireEvent.click(screen.getByRole('button', { name: 'Действия для проекта Project Alpha' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-a'));
    expect(navigation.replace).toHaveBeenCalledWith('/');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
  });

  it('удаление project текущей page начинает replace-navigation на workspace root', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Действия для проекта Project Alpha' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-a'));
    expect(navigation.replace).toHaveBeenCalledWith('/');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
  });

  it('оставляет project в UI при ошибке удаления', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        return HttpResponse.json({ message: 'Raw project delete detail' }, { status: 500 });
      }),
    );
    renderWorkspace({ type: 'root' });
    expect(await screen.findByRole('heading', { name: 'Проекты' })).toBeInTheDocument();

    const alphaProjectActions = screen
      .getAllByRole('button', { name: 'Действия для проекта Project Alpha' })
      .at(-1);
    if (!alphaProjectActions) throw new Error('Project actions are unavailable');
    fireEvent.click(alphaProjectActions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ошибка удаления проекта. Попробуйте ещё раз.',
    );
    expect(screen.queryByText('Raw project delete detail')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { hidden: true, name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(deleteRequests).toHaveBeenCalledWith('project-a');
  });
});
