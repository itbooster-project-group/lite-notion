'use client';

import type { Editor } from '@tiptap/core';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

type EditorPopupPlacement = 'above' | 'below';

type EditorPopupAnchor = Readonly<{
  bottom: number;
  left: number;
  top: number;
}>;

type UseEditorPopupPositionOptions = Readonly<{
  editor: Editor | null;
  getAnchor(): EditorPopupAnchor | undefined;
  placement: EditorPopupPlacement;
}>;

const VIEWPORT_PADDING = 8;
const POPUP_GAP = 8;

export function useEditorPopupPosition({
  editor,
  getAnchor,
  placement,
}: UseEditorPopupPositionOptions) {
  const [floatingElement, setFloatingElement] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<CSSProperties | undefined>();
  const scheduledFrameRef = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setPosition(undefined);
      return;
    }

    let anchor: EditorPopupAnchor | undefined;
    try {
      anchor = getAnchor();
    } catch {
      setPosition(undefined);
      return;
    }

    if (!anchor) {
      setPosition(undefined);
      return;
    }

    const popupRect = floatingElement?.getBoundingClientRect();
    const popupHeight = popupRect?.height ?? 0;
    const popupWidth = popupRect?.width ?? 0;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const aboveTop = anchor.top - POPUP_GAP - popupHeight;
    const belowTop = anchor.bottom + POPUP_GAP;
    const shouldFlipAbove = placement === 'above' && aboveTop < VIEWPORT_PADDING;
    const shouldFlipBelow =
      placement === 'below' &&
      belowTop + popupHeight > viewportHeight - VIEWPORT_PADDING &&
      aboveTop >= VIEWPORT_PADDING;
    const top = shouldFlipAbove
      ? belowTop
      : shouldFlipBelow
        ? aboveTop
        : placement === 'above'
          ? aboveTop
          : belowTop;
    const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - popupWidth - VIEWPORT_PADDING);

    setPosition({
      left: Math.min(Math.max(anchor.left, VIEWPORT_PADDING), maxLeft),
      top: Math.min(
        Math.max(top, VIEWPORT_PADDING),
        Math.max(VIEWPORT_PADDING, viewportHeight - popupHeight - VIEWPORT_PADDING),
      ),
    });
  }, [editor, floatingElement, getAnchor, placement]);

  const scheduleRefresh = useCallback(() => {
    if (scheduledFrameRef.current !== undefined) return;

    scheduledFrameRef.current = window.requestAnimationFrame(() => {
      scheduledFrameRef.current = undefined;
      refresh();
    });
  }, [refresh]);

  useEffect(() => {
    setPosition(undefined);
    if (!editor) return;
    refresh();
    editor.on('selectionUpdate', scheduleRefresh);
    editor.on('transaction', scheduleRefresh);
    window.addEventListener('resize', scheduleRefresh);
    window.addEventListener('scroll', scheduleRefresh, true);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleRefresh);
    resizeObserver?.observe(editor.view.dom);
    if (floatingElement) resizeObserver?.observe(floatingElement);

    return () => {
      editor.off('selectionUpdate', scheduleRefresh);
      editor.off('transaction', scheduleRefresh);
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('scroll', scheduleRefresh, true);
      resizeObserver?.disconnect();
      if (scheduledFrameRef.current !== undefined) {
        window.cancelAnimationFrame(scheduledFrameRef.current);
        scheduledFrameRef.current = undefined;
      }
    };
  }, [editor, floatingElement, refresh, scheduleRefresh]);

  return { floatingRef: setFloatingElement, position } as const;
}
