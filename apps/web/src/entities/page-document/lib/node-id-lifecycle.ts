import type { JSONContent } from '@tiptap/core';

import { createPageDocumentNodeId, isPageDocumentNodeId } from './media-validation';

const PAGE_DOCUMENT_MEDIA_NODE_TYPES = new Set(['image', 'youtube', 'video']);
const MAX_NODE_ID_GENERATION_ATTEMPTS = 100;

type NodeIdFactory = () => string;

function isMediaNode(content: JSONContent): boolean {
  return Boolean(content.type && isPageDocumentMediaNodeType(content.type));
}

export function isPageDocumentMediaNodeType(nodeType: string): boolean {
  return PAGE_DOCUMENT_MEDIA_NODE_TYPES.has(nodeType);
}

function createUniqueNodeId(usedNodeIds: Set<string>, nodeIdFactory: NodeIdFactory): string {
  for (let attempt = 0; attempt < MAX_NODE_ID_GENERATION_ATTEMPTS; attempt += 1) {
    const nodeId = nodeIdFactory();

    if (isPageDocumentNodeId(nodeId) && !usedNodeIds.has(nodeId)) {
      usedNodeIds.add(nodeId);
      return nodeId;
    }
  }

  throw new Error('Unable to generate a unique page document node ID.');
}

export function claimUniquePageDocumentNodeId(
  candidate: unknown,
  usedNodeIds: Set<string>,
  nodeIdFactory: NodeIdFactory = createPageDocumentNodeId,
): string {
  if (isPageDocumentNodeId(candidate) && !usedNodeIds.has(candidate)) {
    usedNodeIds.add(candidate);
    return candidate;
  }

  return createUniqueNodeId(usedNodeIds, nodeIdFactory);
}

function prepareNodeForInsertion(
  content: JSONContent,
  usedNodeIds: Set<string>,
  nodeIdFactory: NodeIdFactory,
): JSONContent {
  const preparedContent = content.content?.map((child) =>
    prepareNodeForInsertion(child, usedNodeIds, nodeIdFactory),
  );

  if (!isMediaNode(content)) {
    return preparedContent ? { ...content, content: preparedContent } : { ...content };
  }

  const attrs = { ...content.attrs };
  const currentNodeId = attrs.nodeId;

  attrs.nodeId = claimUniquePageDocumentNodeId(currentNodeId, usedNodeIds, nodeIdFactory);

  return preparedContent ? { ...content, attrs, content: preparedContent } : { ...content, attrs };
}

export function collectPageDocumentNodeIds(content: JSONContent): Set<string> {
  const nodeIds = new Set<string>();

  function collect(node: JSONContent) {
    const nodeId = node.attrs?.nodeId;
    if (isMediaNode(node) && isPageDocumentNodeId(nodeId)) nodeIds.add(nodeId);
    node.content?.forEach(collect);
  }

  collect(content);
  return nodeIds;
}

export function preparePageDocumentContentForInsertion(
  content: JSONContent,
  existingNodeIds: ReadonlySet<string>,
  nodeIdFactory: NodeIdFactory = createPageDocumentNodeId,
): JSONContent {
  return prepareNodeForInsertion(content, new Set(existingNodeIds), nodeIdFactory);
}
