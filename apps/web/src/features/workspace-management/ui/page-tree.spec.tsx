import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildProjectPageTree, normalizePageTree } from '@/entities/page';
import type { PageTreeNodeDto } from '@/shared/api';

import { PageTree } from './page-tree';

function page(
  id: string,
  parentPageId: string | null,
  children: PageTreeNodeDto[] = [],
  title = id,
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

const source = [
  page('a', null, [page('a-1', 'a', [page('a-1-1', 'a-1', [], 'Deep')], 'Child')], 'Alpha'),
  page('b', null, [], 'Beta'),
];

afterEach(cleanup);

function renderTree(activePageId: string | undefined = undefined) {
  const normalizedTree = normalizePageTree(source);
  const callbacks = {
    onCreatePage: vi.fn().mockResolvedValue(undefined),
    onMovePage: vi.fn().mockResolvedValue(undefined),
    onRenamePage: vi.fn().mockResolvedValue(undefined),
    onRequestDeletePage: vi.fn(),
    onSelectPage: vi.fn(),
  };

  render(
    <PageTree
      activePageId={activePageId}
      normalizedTree={normalizedTree}
      projectTree={buildProjectPageTree(normalizedTree, 'project-a')}
      {...callbacks}
    />,
  );

  return callbacks;
}

describe('workspace page tree', () => {
  it('рендерит ARIA tree в server order и раскрывает ancestor chain active page', async () => {
    renderTree('a-1-1');

    expect(screen.getByRole('tree', { name: 'Страницы проекта' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('treeitem')).toHaveLength(4));
    expect(screen.getAllByRole('treeitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Child'),
      expect.stringContaining('Deep'),
      expect.stringContaining('Beta'),
    ]);
    expect(screen.getByText('Deep').closest('[role="treeitem"]')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'Alpha' })).toHaveStyle({ paddingLeft: '0px' });
    expect(screen.getByRole('treeitem', { name: 'Child' })).toHaveStyle({ paddingLeft: '16px' });
    expect(screen.getByRole('treeitem', { name: 'Deep' })).toHaveStyle({ paddingLeft: '32px' });
  });

  it('раскрывает и сворачивает узлы доступной кнопкой', async () => {
    renderTree();

    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть Alpha' }));
    expect(await screen.findByText('Child')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть Alpha' }));
    await waitFor(() => expect(screen.queryByText('Child')).not.toBeInTheDocument());
  });

  it('перемещает фокус и активирует страницу с клавиатуры', async () => {
    const { onSelectPage } = renderTree();
    const alphaItem = screen.getByRole('treeitem', { name: 'Alpha' });
    const betaItem = screen.getByRole('treeitem', { name: 'Beta' });
    alphaItem.focus();

    fireEvent.keyDown(alphaItem ?? document.body, { code: 'ArrowDown', key: 'ArrowDown' });
    await waitFor(() => expect(betaItem).toHaveFocus());
    fireEvent.keyDown(betaItem ?? document.body, { code: 'Enter', key: 'Enter' });

    expect(onSelectPage).toHaveBeenCalledWith('b');
  });

  it('создаёт root draft, подтверждает Enter и отменяет Escape', async () => {
    const { onCreatePage } = renderTree();

    fireEvent.click(screen.getByRole('button', { name: 'Создать страницу' }));
    const input = screen.getByRole('textbox', { name: 'Название новой страницы' });
    fireEvent.change(input, { target: { value: '  Новая  ' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(onCreatePage).toHaveBeenCalledWith(null, 'Новая'));
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Создать страницу' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('создаёт child draft из node actions', async () => {
    const { onCreatePage } = renderTree();

    fireEvent.click(screen.getByRole('button', { name: 'Действия для Alpha' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Добавить дочернюю' }));
    const input = screen.getByRole('textbox', { name: 'Название новой страницы' });
    fireEvent.change(input, { target: { value: 'Child draft' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(onCreatePage).toHaveBeenCalledWith('a', 'Child draft'));
  });

  it('сохраняет create draft и показывает безопасную ошибку', async () => {
    const normalizedTree = normalizePageTree(source);
    render(
      <PageTree
        activePageId={undefined}
        normalizedTree={normalizedTree}
        projectTree={buildProjectPageTree(normalizedTree, 'project-a')}
        onCreatePage={vi.fn().mockRejectedValue(new Error('Raw create detail'))}
        onMovePage={vi.fn().mockResolvedValue(undefined)}
        onRenamePage={vi.fn().mockResolvedValue(undefined)}
        onRequestDeletePage={vi.fn()}
        onSelectPage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Создать страницу' }));
    const input = screen.getByRole('textbox', { name: 'Название новой страницы' });
    fireEvent.change(input, { target: { value: 'Saved draft' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка создания страницы');
    expect(input).toHaveValue('Saved draft');
    expect(screen.queryByText('Raw create detail')).not.toBeInTheDocument();
  });

  it('запускает rename по F2 и подтверждает Enter', async () => {
    const { onRenamePage } = renderTree('a');
    const alphaItem = screen.getByRole('treeitem', { name: 'Alpha' });
    alphaItem.focus();

    fireEvent.keyDown(alphaItem ?? document.body, { code: 'F2', key: 'F2' });
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: '  Renamed  ' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(onRenamePage).toHaveBeenCalledWith('a', 'Renamed'));

    expect(onRenamePage).toHaveBeenCalledTimes(1);
  });

  it('сохраняет rename draft и показывает безопасную ошибку при отказе', async () => {
    const normalizedTree = normalizePageTree(source);
    const onRenamePage = vi.fn().mockRejectedValue(new Error('Raw backend detail'));
    render(
      <PageTree
        activePageId="a"
        normalizedTree={normalizedTree}
        projectTree={buildProjectPageTree(normalizedTree, 'project-a')}
        onCreatePage={vi.fn().mockResolvedValue(undefined)}
        onMovePage={vi.fn().mockResolvedValue(undefined)}
        onRenamePage={onRenamePage}
        onRequestDeletePage={vi.fn()}
        onSelectPage={vi.fn()}
      />,
    );

    const alphaItem = screen.getByRole('treeitem', { name: 'Alpha' });
    alphaItem.focus();
    fireEvent.keyDown(alphaItem ?? document.body, { code: 'F2', key: 'F2' });
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Draft value' } });
    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка переименования');
    expect(await screen.findByRole('textbox')).toHaveValue('Draft value');
    expect(screen.queryByText('Raw backend detail')).not.toBeInTheDocument();
  });

  it('формирует MoveIntent через доступный dialog и возвращает фокус', async () => {
    const { onMovePage } = renderTree('a');
    const trigger = screen.getByRole('button', { name: 'Действия для Alpha' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переместить…' }));

    expect(await screen.findByRole('dialog', { name: 'Переместить страницу' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Родитель'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Переместить' }));

    await waitFor(() =>
      expect(onMovePage).toHaveBeenCalledWith({
        index: 0,
        pageId: 'a',
        parentPageId: 'b',
        projectId: 'project-a',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('формирует delete intent из node actions без mutation logic', async () => {
    const { onRequestDeletePage } = renderTree('a');
    const trigger = screen.getByRole('button', { name: 'Действия для Alpha' });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Удалить' }));

    expect(onRequestDeletePage).toHaveBeenCalledWith({
      pageId: 'a',
      returnFocus: trigger,
      title: 'Alpha',
    });
  });

  it('перемещает Page A внутрь пустой Page B через pointer DnD', async () => {
    const { onMovePage } = renderTree('a');
    const dragHandle = screen.getByRole('button', { name: 'Перетащить Alpha' });
    const emptyTarget = screen.getByRole('treeitem', { name: 'Beta' });

    expect(emptyTarget).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Раскрыть Beta' })).toBeNull();
    fireEvent.dragStart(dragHandle);
    fireEvent.dragOver(emptyTarget, { clientX: 8, clientY: 8 });
    fireEvent.drop(emptyTarget, { clientX: 8, clientY: 8 });

    await waitFor(() =>
      expect(onMovePage).toHaveBeenCalledWith({
        index: 0,
        pageId: 'a',
        parentPageId: 'b',
        projectId: 'project-a',
      }),
    );
  });

  it('поддерживает запуск и отмену keyboard DnD с сохранением фокуса', async () => {
    const { onMovePage } = renderTree('a');
    const alphaItem = screen.getByRole('treeitem', { name: 'Alpha' });
    alphaItem.focus();

    fireEvent.keyDown(alphaItem, {
      code: 'KeyD',
      ctrlKey: true,
      key: 'd',
      shiftKey: true,
    });
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Alpha' }), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Alpha' }), { key: 'Escape' });

    await waitFor(() => expect(alphaItem).toHaveFocus());
    expect(onMovePage).not.toHaveBeenCalled();
    expect(screen.getByText(/Control.*Shift.*D/i)).toBeInTheDocument();
  });

  it('подтверждает keyboard DnD через общий MoveIntent', async () => {
    const { onMovePage } = renderTree('a');
    const item = screen.getByRole('treeitem', { name: 'Alpha' });

    fireEvent.keyDown(item, { code: 'ControlLeft', key: 'Control' });
    fireEvent.keyDown(item, { code: 'ShiftLeft', key: 'Shift' });
    fireEvent.keyDown(item, {
      code: 'KeyD',
      key: 'd',
    });
    fireEvent.keyUp(item, { code: 'KeyD', key: 'd' });
    fireEvent.keyUp(item, { code: 'ShiftLeft', key: 'Shift' });
    fireEvent.keyUp(item, { code: 'ControlLeft', key: 'Control' });
    fireEvent.keyDown(item, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyUp(item, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(item, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(onMovePage).toHaveBeenCalledOnce());
  });
});
