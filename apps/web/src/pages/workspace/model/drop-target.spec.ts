import { describe, expect, it } from 'vitest';

import { toMoveIntent } from './drop-target';

describe('Headless Tree drop adapter', () => {
  it('преобразует insertion slot в точный MoveIntent', () => {
    expect(toMoveIntent('page-a', { index: 2, parentPageId: 'parent', type: 'insertion' })).toEqual(
      { index: 2, pageId: 'page-a', parentPageId: 'parent' },
    );
  });

  it('преобразует drop на узел в добавление последним ребёнком', () => {
    expect(toMoveIntent('page-a', { childCount: 3, pageId: 'parent', type: 'item' })).toEqual({
      index: 3,
      pageId: 'page-a',
      parentPageId: 'parent',
    });
  });

  it('понимает synthetic root как null parent', () => {
    expect(toMoveIntent('page-a', { childCount: 1, pageId: null, type: 'item' })).toEqual({
      index: 1,
      pageId: 'page-a',
      parentPageId: null,
    });
  });
});
