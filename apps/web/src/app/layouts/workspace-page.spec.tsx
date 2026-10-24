import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDeleteCleanupProvider } from '@/features/workspace-management';
import { WorkspacePage } from '@/pages/workspace';
import {
  getGetPageQueryKey,
  getGetPageTreeQueryKey,
  getListProjectsQueryKey,
  type PageDto,
  type PageTreeNodeDto,
} from '@/shared/api';
import { server } from '@/shared/api/mocks/server';
import type { WorkspaceRouteContext } from '@/shared/routing';
import { useAppShellStore } from '@/widgets/app-shell/model/app-shell-store';
import { PrivateWorkspace } from './private-workspace';

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), pathname: '/' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  usePathname: () => navigation.pathname,
}));

vi.mock('@/entities/session', () => ({
  useSession: () => ({ user: { name: 'Ada' }, clearSession: vi.fn() }),
}));
beforeEach(() => {
  localStorage.clear();
  useAppShellStore.setState({ desktopCollapsed: false, mobileOpen: false });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

function page(
  id: string,
  projectId: string,
  parentPageId: string | null,
  title: string,
  children: PageTreeNodeDto[] = [],
  accessRole: PageTreeNodeDto['accessRole'] = 'owner',
): PageTreeNodeDto {
  return {
    accessMode: 'inherit',
    accessRole,
    children,
    createdAt: '2026-08-29T00:00:00.000Z',
    createdById: 'user-1',
    coverAssetId: null,
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
let currentSharedTree: PageTreeNodeDto[];

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
  currentSharedTree = [];
  server.use(
    http.get('*/api/v1/projects', () => HttpResponse.json(currentProjects)),
    http.get('*/api/v1/pages', () => HttpResponse.json(currentTree)),
    http.get('*/api/v1/pages/shared', () => HttpResponse.json(currentSharedTree)),
    http.get('*/api/v1/pages/:pageId', ({ params }) => {
      const pageId = String(params.pageId);
      const allPages: PageTreeNodeDto[] = [];
      const collect = (nodes: readonly PageTreeNodeDto[]) => {
        for (const node of nodes) {
          allPages.push(node);
          collect(node.children);
        }
      };
      collect(currentTree);
      collect(currentSharedTree);
      const found = allPages.find((node) => node.id === pageId);
      if (found) return HttpResponse.json(asPageDto(found));
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

function renderWorkspace(route: WorkspaceRouteContext) {
  const pathname =
    route.type === 'page'
      ? `/pages/${route.pageId}`
      : route.type === 'project'
        ? `/projects/${route.projectId}`
        : '/';
  return renderPrivateContent(pathname, <WorkspacePage route={route} />);
}

function renderPrivateContent(pathname: string, children: ReactNode) {
  navigation.pathname = pathname;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceDeleteCleanupProvider>
        <PrivateWorkspace>{children}</PrivateWorkspace>
      </WorkspaceDeleteCleanupProvider>
    </QueryClientProvider>,
  );

  return { queryClient, ...view };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe('workspace page', () => {
  it('показывает breadcrumb корзины на маршруте /trash', async () => {
    renderPrivateContent('/trash', <h1>Корзина</h1>);

    await screen.findByRole('heading', { name: 'Корзина' });
    const breadcrumbs = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    expect(breadcrumbs).toHaveTextContent('Корзина');
    expect(within(breadcrumbs).getByText('Корзина')).toHaveAttribute('aria-current', 'page');
  });

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
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'На главную' })).not.toBeInTheDocument();
    const projectList = screen.getByRole('list', { name: 'Список проектов' });
    expect(projectList).toBeInTheDocument();
    expect(within(projectList).getByRole('link', { name: 'Project Alpha' })).toHaveAttribute(
      'href',
      '/projects/project-a',
    );
    expect(screen.queryByText('Рабочая область')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));
    const dialog = await screen.findByRole('dialog', { name: 'Создать проект' });
    const projectName = within(dialog).getByRole('textbox', { name: 'Название проекта' });
    expect(projectName).toHaveFocus();
    fireEvent.change(projectName, {
      target: { value: '  Новый проект  ' },
    });
    fireEvent.keyDown(projectName, { key: 'Enter', code: 'Enter' });
    fireEvent.submit(projectName.closest('form') as HTMLFormElement);

    await waitFor(() => expect(createRequests).toHaveBeenCalledWith({ name: 'Новый проект' }));
    expect(navigation.push).toHaveBeenCalledWith('/projects/created-project');
  });

  it('показывает empty state и открывает создание проекта при пустом списке', async () => {
    currentProjects = [];
    renderWorkspace({ type: 'root' });

    expect(
      await screen.findByText('Создайте первый проект, чтобы начать работу.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Список проектов' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

    expect(await screen.findByRole('dialog', { name: 'Создать проект' })).toBeInTheDocument();
  });

  it('сохраняет независимую клавиатурную навигацию по ссылке и меню карточки', async () => {
    renderWorkspace({ type: 'root' });
    const projectList = await screen.findByRole('list', { name: 'Список проектов' });
    const projectLink = within(projectList).getByRole('link', { name: 'Project Alpha' });
    projectLink.focus();
    expect(projectLink).toHaveFocus();

    const projectActions = within(projectList).getByRole('button', {
      name: 'Действия для проекта Project Alpha',
    });
    projectActions.focus();
    fireEvent.keyDown(projectActions, { key: 'ArrowDown' });
    const deleteAction = await screen.findByRole('menuitem', { name: 'Удалить проект' });
    await waitFor(() => expect(deleteAction).toHaveFocus());
    fireEvent.keyDown(deleteAction, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('показывает валидацию, а после закрытия и повторного открытия очищает старую ошибку', async () => {
    const createRequests = vi.fn();
    server.use(
      http.post('*/api/v1/projects', async ({ request }) => {
        createRequests(await request.json());
        return HttpResponse.json({ message: 'Unavailable' }, { status: 500 });
      }),
    );
    renderWorkspace({ type: 'root' });

    fireEvent.click(await screen.findByRole('button', { name: 'Создать проект' }));
    const dialog = await screen.findByRole('dialog', { name: 'Создать проект' });
    const projectName = within(dialog).getByRole('textbox', { name: 'Название проекта' });
    const form = projectName.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Введите название проекта');
    expect(createRequests).not.toHaveBeenCalled();

    fireEvent.change(projectName, { target: { value: 'a'.repeat(256) } });
    fireEvent.submit(form);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Название может содержать до 255 символов',
    );
    expect(createRequests).not.toHaveBeenCalled();

    fireEvent.change(projectName, { target: { value: 'Retry project' } });
    fireEvent.submit(form);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Ошибка создания проекта. Попробуйте ещё раз.',
    );
    expect(createRequests).toHaveBeenCalledOnce();

    fireEvent.keyDown(projectName, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Создать проект' }));

    const reopenedDialog = await screen.findByRole('dialog', { name: 'Создать проект' });
    expect(within(reopenedDialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(reopenedDialog).getByRole('textbox', { name: 'Название проекта' })).toHaveValue(
      '',
    );
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('не отправляет повторный запрос, пока создание проекта ожидает ответа', async () => {
    let releaseCreate!: () => void;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const createRequests = vi.fn();
    server.use(
      http.post('*/api/v1/projects', async ({ request }) => {
        createRequests(await request.json());
        await createGate;
        return HttpResponse.json(
          { id: 'created-project', name: 'New project', ownerId: 'user-1' },
          { status: 201 },
        );
      }),
    );
    renderWorkspace({ type: 'root' });

    fireEvent.click(await screen.findByRole('button', { name: 'Создать проект' }));
    const dialog = await screen.findByRole('dialog', { name: 'Создать проект' });
    const projectName = within(dialog).getByRole('textbox', { name: 'Название проекта' });
    fireEvent.change(projectName, { target: { value: 'New project' } });
    const form = projectName.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(createRequests).toHaveBeenCalledOnce());
    expect(within(dialog).getByRole('button', { name: 'Создаём…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    releaseCreate();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/projects/created-project'));
  });

  it('собирает project route, фильтрует дерево и выполняет переходы sidebar', async () => {
    renderWorkspace({ projectId: 'project-a', type: 'project' });

    expect(screen.getByText('Загружаем рабочую область…')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(
      await screen.findByRole('heading', { name: 'Project Alpha', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(await screen.findAllByRole('treeitem', { name: 'Alpha page' })).not.toHaveLength(0);
    expect(await screen.findByText('Other project page')).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Хлебные крошки' })).getByRole('link', {
        name: 'На главную',
      }),
    ).toHaveAttribute('href', '/');

    fireEvent.click(screen.getByRole('treeitem', { name: 'Project Beta' }));
    expect(navigation.push).toHaveBeenCalledWith('/projects/project-b');

    const betaPage = screen.getAllByRole('treeitem', { name: 'Beta page' }).at(0);
    if (!betaPage) throw new Error('Beta page is unavailable');
    fireEvent.click(betaPage);
    expect(navigation.push).toHaveBeenCalledWith('/pages/beta');
  });

  it('открывает access panel из sidebar без navigation', async () => {
    renderWorkspace({ projectId: 'project-a', type: 'project' });

    const actions = (await screen.findAllByRole('button', { name: 'Действия для Alpha page' }))[0];
    if (!actions) throw new Error('Page actions are unavailable');
    fireEvent.click(actions);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Настроить доступ' }));

    expect(await screen.findByRole('heading', { name: 'Доступ к странице' })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('разрешает прямую ссылку страницы и показывает единые breadcrumbs и heading', async () => {
    renderWorkspace({ pageId: 'child', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Child page', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Alpha page/Child page',
    );
    expect(await screen.findByRole('treeitem', { name: 'Child page' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить доступ' }));
    expect(await screen.findByRole('heading', { name: 'Доступ к странице' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[data-collaboration-status]')).not.toBeNull(),
    );
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).toBeNull();
  });

  it('не показывает cached ancestor до permission-filtered обновления дерева', async () => {
    const treeRefresh = createDeferred();
    currentTree = [page('child', 'project-a', 'revoked-parent', 'Child page')];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(getGetPageTreeQueryKey(), [
      page('revoked-parent', 'project-a', null, 'Revoked parent', [
        page('child', 'project-a', 'revoked-parent', 'Child page'),
      ]),
    ]);
    server.use(
      http.get('*/api/v1/pages', async () => {
        await treeRefresh.promise;
        return HttpResponse.json(currentTree);
      }),
      http.get('*/api/v1/pages/child', () =>
        HttpResponse.json(asPageDto(page('child', 'project-a', 'revoked-parent', 'Child page'))),
      ),
    );
    navigation.pathname = '/pages/child';
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceDeleteCleanupProvider>
          <PrivateWorkspace>
            <WorkspacePage route={{ pageId: 'child', type: 'page' }} />
          </PrivateWorkspace>
        </WorkspaceDeleteCleanupProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    expect(breadcrumbs).toHaveTextContent('Child page');
    expect(breadcrumbs).not.toHaveTextContent('Revoked parent');
    treeRefresh.resolve();
    await waitFor(() => expect(breadcrumbs).not.toHaveTextContent('Revoked parent'));
    expect(breadcrumbs).toHaveTextContent('Child page');
  });

  it('оставляет обновлённую sidebar навигацию видимой при медленном page access check', async () => {
    const pageRead = createDeferred();
    currentTree = [page('owned', 'project-a', null, 'Owned page')];
    server.use(
      http.get('*/api/v1/pages/owned', async () => {
        await pageRead.promise;
        return HttpResponse.json(asPageDto(page('owned', 'project-a', null, 'Owned page')));
      }),
    );
    renderWorkspace({ pageId: 'owned', type: 'page' });

    expect(await screen.findByText('Проверяем доступ к странице…')).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: 'Owned page' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Owned page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).not.toBeInTheDocument();
    pageRead.resolve();
    expect(await screen.findByRole('heading', { name: 'Owned page' })).toBeInTheDocument();
  });

  it('сохраняет sidebar при переходе A → B и скрывает cache до обновления permission trees', async () => {
    const treeRefresh = createDeferred();
    const sharedRefresh = createDeferred();
    let treeRequests = 0;
    let sharedRequests = 0;
    const betaPage = page('beta', 'project-a', null, 'Beta page');
    const updatedTree = [betaPage];
    currentTree = [
      page('alpha', 'project-a', null, 'Alpha page', [
        page('child', 'project-a', 'alpha', 'Child page'),
      ]),
      page('beta', 'project-a', null, 'Beta page'),
    ];
    currentSharedTree = [
      page('stale-shared', 'foreign-project', null, 'Revoked shared page', [], 'viewer'),
    ];
    server.use(
      http.get('*/api/v1/pages', async () => {
        treeRequests += 1;
        if (treeRequests === 1) return HttpResponse.json(currentTree);
        await treeRefresh.promise;
        return HttpResponse.json(updatedTree);
      }),
      http.get('*/api/v1/pages/shared', async () => {
        sharedRequests += 1;
        if (sharedRequests === 1) return HttpResponse.json(currentSharedTree);
        await sharedRefresh.promise;
        return HttpResponse.json([]);
      }),
      http.get('*/api/v1/pages/beta', () => HttpResponse.json(asPageDto(betaPage))),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderRoute = (pageId: string) => (
      <QueryClientProvider client={queryClient}>
        <WorkspaceDeleteCleanupProvider>
          <PrivateWorkspace>
            <WorkspacePage route={{ pageId, type: 'page' }} />
          </PrivateWorkspace>
        </WorkspaceDeleteCleanupProvider>
      </QueryClientProvider>
    );
    navigation.pathname = '/pages/child';
    const view = render(renderRoute('child'));

    expect(await screen.findByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    const sidebar = screen.getByRole('complementary', { name: 'Боковая панель' });
    const sidebarTreeSlot = sidebar.querySelector('[data-slot="sidebar-page-tree"]');
    const workspaceTree = sidebarTreeSlot?.querySelector('[role="tree"]');
    expect(workspaceTree).not.toBeNull();
    expect(within(sidebar).getByRole('treeitem', { name: 'Alpha page' })).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('button', { name: 'Revoked shared page' }),
    ).toBeInTheDocument();

    currentTree = updatedTree;
    navigation.pathname = '/pages/beta';
    view.rerender(renderRoute('beta'));

    expect(await screen.findByRole('heading', { name: 'Beta page' })).toBeInTheDocument();
    await waitFor(() => {
      expect(treeRequests).toBe(2);
      expect(sharedRequests).toBe(2);
    });
    expect(screen.getByRole('complementary', { name: 'Боковая панель' })).toBe(sidebar);
    expect(sidebar).toHaveClass('w-64');
    expect(sidebar.querySelector('[data-slot="sidebar-page-tree"]')).toBe(sidebarTreeSlot);
    expect(sidebarTreeSlot?.querySelector('[role="tree"]')).toBe(workspaceTree);
    expect(within(sidebar).queryByRole('treeitem', { name: 'Alpha page' })).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('button', { name: 'Revoked shared page' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Загружаем дерево…')).not.toBeInTheDocument();

    treeRefresh.resolve();
    sharedRefresh.resolve();
    expect(await within(sidebar).findByRole('treeitem', { name: 'Beta page' })).toBeInTheDocument();
    expect(within(sidebar).queryByRole('treeitem', { name: 'Alpha page' })).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('button', { name: 'Revoked shared page' }),
    ).not.toBeInTheDocument();
  });

  it('открывает доступную страницу при ошибке обновления дерева без stale ancestor', async () => {
    currentTree = [
      page('parent', 'project-a', null, 'Cached parent', [
        page('child', 'project-a', 'parent', 'Child page'),
      ]),
    ];
    server.use(
      http.get('*/api/v1/pages', () =>
        HttpResponse.json({ message: 'Tree refresh failed' }, { status: 500 }),
      ),
    );

    renderWorkspace({ pageId: 'child', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    expect(breadcrumbs).toHaveTextContent('Child page');
    expect(breadcrumbs).not.toHaveTextContent('Cached parent');
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить дерево.');
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

  it('открывает shared page без matching owned project', async () => {
    currentTree = [];
    const permissionsRequests = vi.fn();
    currentSharedTree = [page('shared-page', 'foreign-project', null, 'Shared page', [], 'viewer')];
    server.use(
      http.get('*/api/v1/pages/shared', () => HttpResponse.json(currentSharedTree)),
      http.get('*/api/v1/pages/:pageId/permissions', () => {
        permissionsRequests();
        return HttpResponse.json([]);
      }),
    );

    renderWorkspace({ pageId: 'shared-page', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Shared page', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Доступные мне/Shared page',
    );
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Доступ к странице' })).not.toBeInTheDocument();
    expect(permissionsRequests).not.toHaveBeenCalled();
  });

  it('открывает shared page из свежего page endpoint, даже если её нет в workspace trees', async () => {
    currentTree = [];
    currentSharedTree = [];
    const sharedPage = page(
      'shared-outside-tree',
      'foreign-project',
      null,
      'Fresh shared page',
      [],
      'viewer',
    );
    server.use(
      http.get('*/api/v1/pages/shared', () => HttpResponse.json([])),
      http.get('*/api/v1/pages/shared-outside-tree', () =>
        HttpResponse.json(asPageDto(sharedPage)),
      ),
    );

    renderWorkspace({ pageId: 'shared-outside-tree', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Fresh shared page', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Загружаем рабочую область…')).not.toBeInTheDocument();
  });

  it('показывает разрешённую страницу до завершения workspace queries без повторных запросов', async () => {
    let releaseMetadata!: () => void;
    const metadataGate = new Promise<void>((resolve) => {
      releaseMetadata = resolve;
    });
    const requests = { projects: 0, tree: 0, shared: 0 };
    server.use(
      http.get('*/api/v1/projects', async () => {
        requests.projects += 1;
        await metadataGate;
        return HttpResponse.json(currentProjects);
      }),
      http.get('*/api/v1/pages', async () => {
        requests.tree += 1;
        await metadataGate;
        return HttpResponse.json(currentTree);
      }),
      http.get('*/api/v1/pages/shared', async () => {
        requests.shared += 1;
        await metadataGate;
        return HttpResponse.json(currentSharedTree);
      }),
    );

    renderWorkspace({ pageId: 'child', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Child page', level: 1 }),
    ).toBeInTheDocument();
    expect(requests).toEqual({ projects: 1, tree: 1, shared: 1 });
    releaseMetadata();
  });

  it('открывает owned page сразу, пока shared query загружается', async () => {
    server.use(
      http.get('*/api/v1/pages/shared', async () => {
        await delay(100);
        return HttpResponse.json([]);
      }),
    );

    renderWorkspace({ pageId: 'child', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Child page', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument();
  });

  it('открывает страницу после подтверждённого page read без ожидания project metadata', async () => {
    currentProjects = [{ id: 'project-b', name: 'Project Beta', ownerId: 'user-1' }];
    currentTree = [page('owned', 'project-a', null, 'Owned page')];

    renderWorkspace({ pageId: 'owned', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Owned page' })).toBeInTheDocument();
  });

  it.each([403, 404])(
    'не показывает cached tree, если свежая проверка доступа вернула %s',
    async (status) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      queryClient.setQueryData(getGetPageTreeQueryKey(), [
        page('child', 'project-a', null, 'Private cached title'),
      ]);
      queryClient.setQueryData(
        getGetPageQueryKey('child'),
        asPageDto(page('child', 'project-a', null, 'Cached page title')),
      );
      server.use(
        http.get('*/api/v1/pages/child', () =>
          HttpResponse.json({ message: 'Access revoked' }, { status }),
        ),
      );
      navigation.pathname = '/pages/child';
      render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceDeleteCleanupProvider>
            <PrivateWorkspace>
              <WorkspacePage route={{ pageId: 'child', type: 'page' }} />
            </PrivateWorkspace>
          </WorkspaceDeleteCleanupProvider>
        </QueryClientProvider>,
      );

      expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeInTheDocument();
      expect(screen.queryByText('Private cached title')).not.toBeInTheDocument();
      expect(screen.queryByText('Cached page title')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Private cached title' }),
      ).not.toBeInTheDocument();
    },
  );

  it('hides cached PageDto and route metadata until the fresh page read completes', async () => {
    const pageRead = createDeferred();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      getGetPageQueryKey('child'),
      asPageDto(page('child', 'project-a', null, 'Cached old title')),
    );
    queryClient.setQueryData(getGetPageTreeQueryKey(), [
      page('child', 'project-a', null, 'Cached old title'),
    ]);
    server.use(
      http.get('*/api/v1/pages/child', async () => {
        await pageRead.promise;
        return HttpResponse.json(asPageDto(page('child', 'project-a', null, 'Fresh page title')));
      }),
    );
    navigation.pathname = '/pages/child';
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceDeleteCleanupProvider>
          <PrivateWorkspace>
            <WorkspacePage route={{ pageId: 'child', type: 'page' }} />
          </PrivateWorkspace>
        </WorkspaceDeleteCleanupProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Проверяем доступ к странице…')).toBeInTheDocument();
    expect(screen.queryByText('Cached old title')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Содержимое страницы' })).not.toBeInTheDocument();
    pageRead.resolve();
    expect(await screen.findByRole('heading', { name: 'Fresh page title' })).toBeInTheDocument();
  });

  it('ошибка projects query не блокирует страницу с подтверждённым доступом', async () => {
    currentTree = [page('owned', 'project-a', null, 'Owned page')];
    let attempts = 0;
    server.use(
      http.get('*/api/v1/projects', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: 'Projects failure' }, { status: 500 })
          : HttpResponse.json(currentProjects);
      }),
    );

    renderWorkspace({ pageId: 'owned', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Owned page' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку дерева' }));
    await waitFor(() => expect(attempts).toBe(2));
    expect(screen.getByRole('heading', { name: 'Owned page' })).toBeInTheDocument();
  });

  it('открывает shared page при ошибке projects и строит shared breadcrumbs', async () => {
    currentTree = [];
    currentSharedTree = [page('shared-page', 'foreign-project', null, 'Shared page', [], 'viewer')];
    server.use(
      http.get('*/api/v1/projects', () =>
        HttpResponse.json({ message: 'Projects failure' }, { status: 500 }),
      ),
    );

    renderWorkspace({ pageId: 'shared-page', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Shared page' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Доступные мне/Shared page',
    );
  });

  it('скрывает shared breadcrumbs, пока permission-filtered workspace metadata обновляется', async () => {
    currentTree = [];
    currentSharedTree = [page('shared-page', 'foreign-project', null, 'Shared page', [], 'viewer')];
    const projects = createDeferred();
    server.use(
      http.get('*/api/v1/projects', async () => {
        await projects.promise;
        return HttpResponse.json(currentProjects);
      }),
    );

    renderWorkspace({ pageId: 'shared-page', type: 'page' });

    expect(await screen.findByText('Проверяем доступ к странице…')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).not.toHaveTextContent(
      'Shared page',
    );
    projects.resolve();
    expect(await screen.findByRole('heading', { name: 'Shared page' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Хлебные крошки' })).toHaveTextContent(
      'Доступные мне/Shared page',
    );
  });

  it('принимает 404 от page endpoint как штатное недоступное состояние', async () => {
    currentTree = [];

    renderWorkspace({ pageId: 'missing', type: 'page' });

    expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeInTheDocument();
  });

  it('открывает owned page, а shared error оставляет локальным', async () => {
    currentTree = [page('owned', 'project-a', null, 'Owned page')];
    server.use(
      http.get('*/api/v1/pages/shared', () =>
        HttpResponse.json({ message: 'Shared failure' }, { status: 500 }),
      ),
    );

    renderWorkspace({ pageId: 'owned', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Owned page', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить доступные страницы.',
    );
    expect(
      screen.queryByRole('heading', { name: 'Ошибка загрузки страницы' }),
    ).not.toBeInTheDocument();
  });

  it('показывает page-level retry при ошибке проверки доступа', async () => {
    currentTree = [page('owned', 'project-a', null, 'Owned page')];
    let attempts = 0;
    server.use(
      http.get('*/api/v1/pages/owned', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: 'Private page failure' }, { status: 500 })
          : HttpResponse.json(asPageDto(page('owned', 'project-a', null, 'Owned page')));
      }),
    );

    renderWorkspace({ pageId: 'owned', type: 'page' });

    expect(
      await screen.findByRole('heading', { name: 'Ошибка загрузки страницы' }),
    ).toBeInTheDocument();
    const retryButtons = screen.getAllByRole('button', { name: 'Повторить' });
    fireEvent.click(retryButtons.at(-1) as HTMLButtonElement);
    expect(await screen.findByRole('heading', { name: 'Owned page' })).toBeInTheDocument();
  });

  it.each([
    { projectId: 'missing', type: 'project' } as const,
    { pageId: 'missing', type: 'page' } as const,
  ])('показывает одинаковое безопасное состояние для отсутствующего route id', async (route) => {
    renderWorkspace(route);

    expect(await screen.findByRole('heading', { name: 'Ничего не найдено' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
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
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByText('Private database detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
  });

  it('открывает mobile drawer, закрывает его по Escape и возвращает фокус', async () => {
    renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });
    const trigger = screen.getByRole('button', { name: 'Открыть боковую панель' });

    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Боковая панель' })).toBeInTheDocument();
    expect(screen.queryByText('Навигация по проекту')).not.toBeInTheDocument();
    expect(screen.queryByText('Проекты и страницы рабочей области.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Закрыть боковую панель' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
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
    const [input] = await screen.findAllByRole('textbox');
    if (!input) throw new Error('Rename input was not rendered');
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
    const [input] = await screen.findAllByRole('textbox');
    if (!input) throw new Error('Rename input was not rendered');
    fireEvent.change(input, { target: { value: 'Draft rename' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка переименования страницы');
    expect(screen.getByRole('heading', { name: 'Child page' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Draft rename');
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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('beta'));
    await waitFor(() =>
      expect(screen.queryAllByRole('treeitem', { name: 'Beta page' })).toHaveLength(0),
    );
    expect(screen.getAllByRole('treeitem', { name: 'Alpha page' })).not.toHaveLength(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('отменяет in-flight page tree refetch перед affected page delete', async () => {
    const deleteRequests = vi.fn();
    const refetch = createDeferred();
    let pageTreeRequests = 0;
    server.use(
      http.get('*/api/v1/pages', async () => {
        pageTreeRequests += 1;
        if (pageTreeRequests === 1) return HttpResponse.json(currentTree);

        await refetch.promise;
        return HttpResponse.json([page('beta', 'project-a', null, 'Beta page')]);
      }),
      http.delete('*/api/v1/pages/:pageId', ({ params }) => {
        deleteRequests(params.pageId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { queryClient } = renderWorkspace({ pageId: 'child', type: 'page' });
    await screen.findByRole('heading', { name: 'Child page' });

    fireEvent.click(await screen.findByRole('button', { name: 'Действия для Child page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));
    expect(await screen.findByRole('dialog', { name: 'Удалить страницу?' })).toBeInTheDocument();

    const refetchPromise = queryClient.invalidateQueries({ queryKey: getGetPageTreeQueryKey() });
    await waitFor(() => expect(pageTreeRequests).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('child'));
    expect(navigation.replace).toHaveBeenCalledWith('/projects/project-a');

    refetch.resolve();
    await refetchPromise;

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Child page' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

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
    expect(navigation.push).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));

    expect(await screen.findByRole('dialog', { name: 'Удалить проект?' })).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-b'));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Project Beta' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('treeitem', { name: 'Other project page' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('не меняет profile route при удалении unrelated project из navigation', async () => {
    const deleteRequests = vi.fn();
    server.use(
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        currentProjects = currentProjects.filter((project) => project.id !== params.projectId);
        currentTree = currentTree.filter((pageNode) => pageNode.projectId !== params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPrivateContent('/profile', <h1>Профиль</h1>);
    await screen.findByRole('heading', { name: 'Профиль' });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Действия для проекта Project Beta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-b'));
    expect(screen.getByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    const breadcrumbs = screen.getByRole('navigation', { name: 'Хлебные крошки' });
    expect(within(breadcrumbs).getByRole('link', { name: 'На главную' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(breadcrumbs).toHaveTextContent('Профиль');
    expect(breadcrumbs).not.toHaveTextContent('Проекты');
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
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-a'));
    expect(navigation.replace).toHaveBeenCalledWith('/');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument();
  });

  it('отменяет in-flight projects/page tree refetch перед affected project delete', async () => {
    const deleteRequests = vi.fn();
    const projectsRefetch = createDeferred();
    const pageTreeRefetch = createDeferred();
    let projectRequests = 0;
    let pageTreeRequests = 0;
    server.use(
      http.get('*/api/v1/projects', async () => {
        projectRequests += 1;
        if (projectRequests === 1) return HttpResponse.json(currentProjects);

        await projectsRefetch.promise;
        return HttpResponse.json([{ id: 'project-b', name: 'Project Beta', ownerId: 'user-1' }]);
      }),
      http.get('*/api/v1/pages', async () => {
        pageTreeRequests += 1;
        if (pageTreeRequests === 1) return HttpResponse.json(currentTree);

        await pageTreeRefetch.promise;
        return HttpResponse.json([page('other', 'project-b', null, 'Other project page')]);
      }),
      http.delete('*/api/v1/projects/:projectId', ({ params }) => {
        deleteRequests(params.projectId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { queryClient } = renderWorkspace({ projectId: 'project-a', type: 'project' });
    await screen.findByRole('heading', { name: 'Project Alpha' });

    const projectsRefetchPromise = queryClient.invalidateQueries({
      queryKey: getListProjectsQueryKey(),
    });
    const pageTreeRefetchPromise = queryClient.invalidateQueries({
      queryKey: getGetPageTreeQueryKey(),
    });
    await waitFor(() => expect(projectRequests).toBe(2));
    await waitFor(() => expect(pageTreeRequests).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Действия для проекта Project Alpha' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить проект' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(deleteRequests).toHaveBeenCalledWith('project-a'));
    expect(navigation.replace).toHaveBeenCalledWith('/');

    projectsRefetch.resolve();
    pageTreeRefetch.resolve();
    await Promise.all([projectsRefetchPromise, pageTreeRefetchPromise]);

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ничего не найдено' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
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
