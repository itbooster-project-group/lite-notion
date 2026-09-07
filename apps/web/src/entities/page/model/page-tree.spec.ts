import { describe, expect, it } from 'vitest';
import type { PageTreeNodeDto } from '@/shared/api';
import {
  buildProjectPageTree,
  collectPageSubtreeIds,
  getBreadcrumbs,
  isMoveIntentValid,
  isPageInSubtree,
  mapMoveIntentToDto,
  movePageInTree,
  normalizePageTree,
  removePageSubtreeFromTree,
  removeProjectPagesFromTree,
  renamePageInTree,
} from './page-tree';

function page(
  id: string,
  projectId: string,
  parentPageId: string | null,
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
    title: id,
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}

const source = [
  page('a', 'project-a', null, [page('a-child', 'project-a', 'a')]),
  page('b', 'project-a', null),
  page('c', 'project-a', null),
  page('other', 'project-b', null),
];

describe('page tree domain model', () => {
  it('нормализует связи, строит breadcrumbs и отмечает empty page как folder-capable', () => {
    const normalized = normalizePageTree(source);
    const projectTree = buildProjectPageTree(normalized, 'project-a');

    expect(normalized.parentIdById['a-child']).toBe('a');
    expect(getBreadcrumbs(normalized, 'a-child').map((item) => item.title)).toEqual([
      'a',
      'a-child',
    ]);
    expect(projectTree.items.b).toMatchObject({
      canHaveChildren: true,
      hasChildren: false,
    });
  });

  it('переименовывает страницу без изменения соседей', () => {
    const renamed = renamePageInTree(source, 'b', 'Renamed');
    expect(renamed[1]?.title).toBe('Renamed');
    expect(renamed[0]).toBe(source[0]);
  });

  it('меняет порядок siblings и формирует transport anchors', () => {
    const intent = {
      index: 0,
      pageId: 'c',
      parentPageId: null,
      projectId: 'project-a',
    } as const;
    const normalized = normalizePageTree(source);

    expect(mapMoveIntentToDto(normalized, intent)).toEqual({
      nextSiblingId: 'a',
      parentPageId: null,
      previousSiblingId: null,
    });
    expect(
      movePageInTree(source, intent)
        .slice(0, 3)
        .map((item) => item.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('перемещает страницу к другому parent', () => {
    const moved = movePageInTree(source, {
      index: 1,
      pageId: 'b',
      parentPageId: 'a',
      projectId: 'project-a',
    });

    expect(moved[0]?.children.map((item) => item.id)).toEqual(['a-child', 'b']);
    expect(moved.map((item) => item.id)).not.toContain('b');
  });

  it('перемещает Page A внутрь пустой Page B', () => {
    const moved = movePageInTree(source, {
      index: 0,
      pageId: 'c',
      parentPageId: 'b',
      projectId: 'project-a',
    });

    expect(moved.find((item) => item.id === 'b')?.children.map((item) => item.id)).toEqual(['c']);
  });

  it('запрещает self, parent → descendant и переход в другой проект', () => {
    const normalized = normalizePageTree(source);

    expect(
      isMoveIntentValid(normalized, {
        index: 0,
        pageId: 'a',
        parentPageId: 'a',
        projectId: 'project-a',
      }),
    ).toBe(false);
    expect(
      isMoveIntentValid(normalized, {
        index: 0,
        pageId: 'a',
        parentPageId: 'a-child',
        projectId: 'project-a',
      }),
    ).toBe(false);
    expect(
      isMoveIntentValid(normalized, {
        index: 0,
        pageId: 'a',
        parentPageId: null,
        projectId: 'project-b',
      }),
    ).toBe(false);
    expect(
      isMoveIntentValid(normalized, {
        index: 0,
        pageId: 'a',
        parentPageId: 'other',
        projectId: 'project-a',
      }),
    ).toBe(false);
  });

  it('удаляет корневое поддерево страницы без изменения страниц других проектов', () => {
    const removed = removePageSubtreeFromTree(source, 'a');

    expect(removed.map((item) => item.id)).toEqual(['b', 'c', 'other']);
    expect(removed.find((item) => item.id === 'a-child')).toBeUndefined();
  });

  it('удаляет вложенное поддерево страницы и сохраняет siblings', () => {
    const removed = removePageSubtreeFromTree(source, 'a-child');

    expect(removed.map((item) => item.id)).toEqual(['a', 'b', 'c', 'other']);
    expect(removed[0]?.children).toEqual([]);
  });

  it('повторно удаляет отсутствующее поддерево без изменения unrelated pages', () => {
    const removedOnce = removePageSubtreeFromTree(source, 'a');
    const removedTwice = removePageSubtreeFromTree(removedOnce, 'a');

    expect(removedTwice.map((item) => item.id)).toEqual(['b', 'c', 'other']);
  });

  it('удаляет все страницы проекта и сохраняет другие проекты', () => {
    const removed = removeProjectPagesFromTree(source, 'project-a');

    expect(removed.map((item) => item.id)).toEqual(['other']);
    expect(removeProjectPagesFromTree(removed, 'project-a')).toEqual(removed);
  });

  it('определяет id поддерева и принадлежность страницы к нему', () => {
    const normalized = normalizePageTree(source);

    expect([...collectPageSubtreeIds(normalized, 'a')].sort()).toEqual(['a', 'a-child']);
    expect(isPageInSubtree(normalized, 'a', 'a-child')).toBe(true);
    expect(isPageInSubtree(normalized, 'a', 'b')).toBe(false);
  });
});
