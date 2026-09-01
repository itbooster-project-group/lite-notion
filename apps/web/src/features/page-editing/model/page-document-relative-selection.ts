import type { Editor } from '@tiptap/core';
import type { ProsemirrorBinding } from '@tiptap/y-tiptap';
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from '@tiptap/y-tiptap';
import type * as Y from 'yjs';

export type PageDocumentRelativeSelection = Readonly<{
  doc: Y.Doc;
  from: Y.RelativePosition;
  fromOffset: number;
  to: Y.RelativePosition;
  toOffset: number;
  wasEmpty: boolean;
}>;

type YSyncPluginState = Readonly<{
  binding?: ProsemirrorBinding;
}>;

function getBinding(editor: Editor): ProsemirrorBinding | undefined {
  const pluginState = ySyncPluginKey.getState(editor.state) as YSyncPluginState | undefined;
  const binding = pluginState?.binding;

  return binding && !editor.isDestroyed ? binding : undefined;
}

export function createPageDocumentRelativeSelection(
  editor: Editor,
): PageDocumentRelativeSelection | undefined {
  const binding = getBinding(editor);
  if (!binding) return undefined;

  const { from, to } = editor.state.selection;
  const wasEmpty = from === to;
  // Non-empty boundaries are anchored inside the selected content. This avoids
  // including concurrent text inserted exactly at either edge of the range.
  const relativeFrom = wasEmpty ? from : Math.min(from + 1, to);
  const relativeTo = wasEmpty ? to : Math.max(to - 1, from);

  return {
    doc: binding.doc,
    from: absolutePositionToRelativePosition(relativeFrom, binding.type, binding.mapping),
    fromOffset: wasEmpty ? 0 : -1,
    to: absolutePositionToRelativePosition(relativeTo, binding.type, binding.mapping),
    toOffset: wasEmpty ? 0 : 1,
    wasEmpty,
  };
}

export function resolvePageDocumentRelativeSelection(
  editor: Editor,
  selection: PageDocumentRelativeSelection,
): Readonly<{ from: number; to: number }> | undefined {
  const binding = getBinding(editor);
  if (!binding || binding.doc !== selection.doc) return undefined;

  const relativeFrom = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    selection.from,
    binding.mapping,
  );
  const relativeTo = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    selection.to,
    binding.mapping,
  );

  if (relativeFrom === null || relativeTo === null) return undefined;

  const from = Math.min(relativeFrom + selection.fromOffset, relativeTo + selection.toOffset);
  const to = Math.max(relativeFrom + selection.fromOffset, relativeTo + selection.toOffset);
  const documentEnd = editor.state.doc.content.size;

  if (from < 0 || to > documentEnd || (!selection.wasEmpty && from === to)) return undefined;

  return { from, to };
}
