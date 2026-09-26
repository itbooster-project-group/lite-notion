import type { CSSProperties } from 'react';

export type TreeDropIndicatorProps = Readonly<{
  /** Результат `tree.getDragLineStyle()` — `{ display: 'none' }`, когда перетаскивание не активно. */
  style: CSSProperties;
}>;

/**
 * Визуальная линия вставки для drag-and-drop в дереве (`@headless-tree`'s
 * `getDragLineData`/`getDragLineStyle`). Рендерится поверх дерева и ничего не
 * показывает вне активного и допустимого перетаскивания.
 */
export function TreeDropIndicator({ style }: TreeDropIndicatorProps) {
  return <div aria-hidden="true" className="h-0.5 rounded-full bg-primary" style={style} />;
}
