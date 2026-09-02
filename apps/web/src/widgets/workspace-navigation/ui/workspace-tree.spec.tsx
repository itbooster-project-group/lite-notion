import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizePageTree } from '@/entities/page';
import type { PageTreeNodeDto, ProjectDto } from '@/shared/api';
import { WorkspaceTreeExpansionProvider } from '../model/workspace-tree-expansion';
import { WorkspaceTree } from './workspace-tree';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
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

const projects: ProjectDto[] = [
  { id: 'project-a', name: 'Project Alpha', ownerId: 'user-1' },
  { id: 'project-b', name: 'Project Beta', ownerId: 'user-1' },
];

const source = [
  page('alpha', 'project-a', null, 'Alpha page', [
    page('child', 'project-a', 'alpha', 'Child page'),
  ]),
  page('empty', 'project-a', null, 'Empty page'),
  page('other', 'project-b', null, 'Other page'),
];

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
});

function tree(
  pages = source,
  activePageId: string | undefined = undefined,
  activeProjectId: string | undefined = undefined,
) {
  return (
    <WorkspaceTreeExpansionProvider>
      <WorkspaceTree
        activePageId={activePageId}
        activeProjectId={activeProjectId}
        normalizedTree={normalizePageTree(pages)}
        projects={projects}
        onCreatePage={vi.fn().mockResolvedValue(undefined)}
        onMovePage={vi.fn().mockResolvedValue(undefined)}
        onRenamePage={vi.fn().mockResolvedValue(undefined)}
      />
    </WorkspaceTreeExpansionProvider>
  );
}

describe('workspace tree', () => {
  it('рендерит проекты и страницы одним ARIA tree с корректными уровнями', async () => {
    render(tree());

    expect(screen.getAllByRole('tree', { name: 'Проекты и страницы' })).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(5));
    expect(screen.getByRole('treeitem', { name: 'Project Alpha' })).toHaveAttribute(
      'aria-level',
      '1',
    );
    expect(screen.getByRole('treeitem', { name: 'Alpha page' })).toHaveAttribute('aria-level', '2');
    expect(screen.getByRole('treeitem', { name: 'Project Beta' })).toHaveAttribute(
      'aria-level',
      '1',
    );
    expect(screen.queryByRole('button', { name: 'Перетащить Project Alpha' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Перетащить Alpha page' })).toBeInTheDocument();
  });

  it('перемещает фокус с проекта по страницам к следующему проекту', async () => {
    render(tree());
    const projectAlpha = await screen.findByRole('treeitem', { name: 'Project Alpha' });
    const alpha = await screen.findByRole('treeitem', { name: 'Alpha page' });
    const empty = await screen.findByRole('treeitem', { name: 'Empty page' });
    const projectBeta = await screen.findByRole('treeitem', { name: 'Project Beta' });

    projectAlpha.focus();
    fireEvent.keyDown(projectAlpha, { code: 'ArrowDown', key: 'ArrowDown' });
    await waitFor(() => expect(alpha).toHaveFocus());
    fireEvent.keyDown(alpha, { code: 'ArrowDown', key: 'ArrowDown' });
    await waitFor(() => expect(empty).toHaveFocus());
    fireEvent.keyDown(empty, { code: 'ArrowDown', key: 'ArrowDown' });
    await waitFor(() => expect(projectBeta).toHaveFocus());
  });

  it('сохраняет collapse проекта при обновлении данных дерева', async () => {
    const view = render(tree());
    const collapse = await screen.findByRole('button', { name: 'Свернуть Project Alpha' });
    fireEvent.click(collapse);
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Alpha page' })).toBeNull());

    const updated = source.map((item) =>
      item.id === 'alpha' ? { ...item, title: 'Alpha updated' } : item,
    );
    view.rerender(tree(updated));

    expect(screen.queryByRole('treeitem', { name: 'Alpha updated' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Раскрыть Project Alpha' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть Project Alpha' }));
    expect(await screen.findByRole('treeitem', { name: 'Alpha updated' })).toBeInTheDocument();
  });

  it('переходит по project/page и сохраняет active page после cache update', async () => {
    const view = render(tree(source, 'empty'));
    const activePage = await screen.findByRole('treeitem', { name: 'Empty page' });
    expect(activePage).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('treeitem', { name: 'Project Beta' }));
    expect(navigation.push).toHaveBeenCalledWith('/projects/project-b');
    fireEvent.click(activePage);
    expect(navigation.push).toHaveBeenCalledWith('/pages/empty');

    const updated = source.map((item) =>
      item.id === 'empty' ? { ...item, title: 'Empty updated' } : item,
    );
    view.rerender(tree(updated, 'empty'));
    expect(await screen.findByRole('treeitem', { name: 'Empty updated' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('считает пустую страницу folder-capable, но не показывает пустой chevron', async () => {
    render(tree());
    const empty = await screen.findByRole('treeitem', { name: 'Empty page' });

    expect(empty).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Раскрыть Empty page' })).toBeNull();
  });
});
