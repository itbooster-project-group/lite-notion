import type {
  DocumentProjection,
  ProseMirrorJSONContent,
} from '../../document-projection/document-projection';

const BLOCK_NODES = new Set([
  'bulletList',
  'doc',
  'listItem',
  'orderedList',
  'taskItem',
  'taskList',
]);
const MEDIA_NODES = new Set(['image', 'video', 'youtube']);

export function extractSearchableText(content: DocumentProjection['contentJson']): string {
  return textFromNode(content)
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textFromNode(node: ProseMirrorJSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';

  if (MEDIA_NODES.has(node.type)) {
    const attrs = node.attrs ?? {};
    const visibleText = [attrs.alt, attrs.caption].filter(isNonBlankText);
    return visibleText.join(' ');
  }

  const children = (node.content ?? []).map(textFromNode);
  return children.join(BLOCK_NODES.has(node.type) ? '\n' : '');
}

function isNonBlankText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
