import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

export const PAGE_DOCUMENT_BLOCK_MOVE_DIRECTIONS = ['up', 'down'] as const;

export type PageDocumentBlockMoveDirection = (typeof PAGE_DOCUMENT_BLOCK_MOVE_DIRECTIONS)[number];

const REORDERABLE_TOP_LEVEL_NODE_NAMES = new Set([
  'bulletList',
  'heading',
  'image',
  'orderedList',
  'paragraph',
  'taskList',
  'video',
  'youtube',
]);

type TopLevelBlock = Readonly<{
  index: number;
  node: NonNullable<ReturnType<Editor['state']['doc']['childAfter']>['node']>;
  pos: number;
}>;

function getSelectedTopLevelBlock(editor: Editor): TopLevelBlock | undefined {
  const { $from } = editor.state.selection;

  if ($from.depth > 0) {
    const node = $from.node(1);
    return {
      index: $from.index(0),
      node,
      pos: $from.before(1),
    };
  }

  const child = editor.state.doc.childAfter($from.pos);
  if (!child.node) return undefined;

  return {
    index: child.index,
    node: child.node,
    pos: $from.pos,
  };
}

function canMoveTopLevelBlock(
  block: TopLevelBlock,
  editor: Editor,
  direction: PageDocumentBlockMoveDirection,
) {
  if (!REORDERABLE_TOP_LEVEL_NODE_NAMES.has(block.node.type.name)) return false;

  return direction === 'up' ? block.index > 0 : block.index < editor.state.doc.childCount - 1;
}

export function canMovePageDocumentBlock(
  editor: Editor,
  direction: PageDocumentBlockMoveDirection,
): boolean {
  const block = getSelectedTopLevelBlock(editor);
  return Boolean(block && canMoveTopLevelBlock(block, editor, direction));
}

export function movePageDocumentBlock(
  editor: Editor,
  direction: PageDocumentBlockMoveDirection,
): boolean {
  const block = getSelectedTopLevelBlock(editor);
  if (!block || !canMoveTopLevelBlock(block, editor, direction)) return false;

  const { doc, tr } = editor.state;
  const adjacentIndex = direction === 'up' ? block.index - 1 : block.index + 1;
  const adjacentNode = doc.child(adjacentIndex);
  const movedBlockPos =
    direction === 'up' ? block.pos - adjacentNode.nodeSize : block.pos + adjacentNode.nodeSize;

  tr.delete(block.pos, block.pos + block.node.nodeSize).insert(movedBlockPos, block.node);
  tr.setSelection(NodeSelection.create(tr.doc, movedBlockPos)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();

  return true;
}
