import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageTreeNodeDto } from '@/shared/api';
import { SharedPagesTree } from './shared-pages-tree';

function page(id: string, title: string, children: PageTreeNodeDto[] = []): PageTreeNodeDto {
  return {
    accessMode: 'inherit',
    accessRole: 'viewer',
    children,
    createdAt: '2026-09-01T00:00:00.000Z',
    createdById: 'owner-1',
    id,
    ownerId: 'owner-1',
    parentPageId: null,
    position: id,
    projectId: 'foreign-project',
    title,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

afterEach(() => cleanup());

describe('SharedPagesTree', () => {
  it('показывает hierarchy и открывает вложенную страницу', () => {
    const onSelectPage = vi.fn();
    render(
      <SharedPagesTree
        onSelectPage={onSelectPage}
        pages={[page('parent', 'Parent', [page('child', 'Child')])]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Доступные мне' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть Parent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Child' }));

    expect(onSelectPage).toHaveBeenCalledWith('child');
  });

  it('показывает empty state', () => {
    render(<SharedPagesTree onSelectPage={vi.fn()} pages={[]} />);

    expect(screen.getByText('Пока нет доступных страниц.')).toBeInTheDocument();
  });

  it('показывает error state и вызывает retry', () => {
    const onRetry = vi.fn();
    render(<SharedPagesTree isError onRetry={onRetry} onSelectPage={vi.fn()} pages={[]} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить доступные страницы.');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('показывает loading state', () => {
    render(<SharedPagesTree isLoading onSelectPage={vi.fn()} pages={[]} />);

    expect(screen.getByText('Загружаем доступные страницы…')).toHaveAttribute('aria-busy', 'true');
  });

  it('не показывает owner-only controls', () => {
    render(<SharedPagesTree onSelectPage={vi.fn()} pages={[page('page', 'Page')]} />);

    expect(screen.queryByText(/Создать|Переименовать|Переместить|Удалить/)).not.toBeInTheDocument();
  });
});
