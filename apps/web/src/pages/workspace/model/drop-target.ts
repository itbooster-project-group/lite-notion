import type { MoveIntent } from './page-tree';

export type PageDropTarget =
  | Readonly<{ type: 'item'; pageId: string | null; childCount: number }>
  | Readonly<{ type: 'insertion'; parentPageId: string | null; index: number }>;

export function toMoveIntent(pageId: string, target: PageDropTarget): MoveIntent {
  if (target.type === 'insertion') {
    return { pageId, parentPageId: target.parentPageId, index: target.index };
  }

  return { pageId, parentPageId: target.pageId, index: target.childCount };
}
