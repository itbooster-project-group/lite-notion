import type { MovePageDto, PageDto, PageTreeNodeDto } from '@/shared/api';

export const SYNTHETIC_ROOT_PREFIX = 'project-root:';
export const UNTITLED_PAGE_LABEL = 'Без названия';

export type NormalizedPage = Omit<PageTreeNodeDto, 'children'>;

export type NormalizedPageTree = Readonly<{
  nodesById: Readonly<Record<string, NormalizedPage>>;
  parentIdById: Readonly<Record<string, string | null>>;
  childIdsByParentId: Readonly<Record<string, readonly string[]>>;
  rootIdsByProjectId: Readonly<Record<string, readonly string[]>>;
}>;

export type PageTreeItemData = Readonly<{
  id: string;
  title: string;
  projectId: string;
  parentPageId: string | null;
  childrenIds: readonly string[];
  canHaveChildren: boolean;
  hasChildren: boolean;
  synthetic: boolean;
}>;

export type ProjectPageTree = Readonly<{
  projectId: string;
  rootItemId: string;
  items: Readonly<Record<string, PageTreeItemData>>;
}>;

export type PageBreadcrumb = Readonly<{
  id: string;
  title: string;
}>;

export type MoveIntent = Readonly<{
  pageId: string;
  projectId: string;
  parentPageId: string | null;
  index: number;
}>;

export type PageDropTarget =
  | Readonly<{
      type: 'item';
      parentPageId: string | null;
      projectId: string;
      childCount: number;
    }>
  | Readonly<{
      type: 'insertion';
      parentPageId: string | null;
      projectId: string;
      index: number;
    }>;

export function normalizePageTree(nodes: readonly PageTreeNodeDto[]): NormalizedPageTree {
  const nodesById: Record<string, NormalizedPage> = {};
  const parentIdById: Record<string, string | null> = {};
  const childIdsByParentId: Record<string, readonly string[]> = {};
  const rootIdsByProjectId: Record<string, string[]> = {};

  const visit = (node: PageTreeNodeDto) => {
    const { children, ...page } = node;
    nodesById[node.id] = page;
    parentIdById[node.id] = node.parentPageId;
    childIdsByParentId[node.id] = children.map((child) => child.id);

    if (node.parentPageId === null) {
      rootIdsByProjectId[node.projectId] = [...(rootIdsByProjectId[node.projectId] ?? []), node.id];
    }

    for (const child of children) visit(child);
  };

  for (const node of nodes) visit(node);

  return { nodesById, parentIdById, childIdsByParentId, rootIdsByProjectId };
}

export function buildProjectPageTree(tree: NormalizedPageTree, projectId: string): ProjectPageTree {
  const rootItemId = `${SYNTHETIC_ROOT_PREFIX}${projectId}`;
  const rootChildren = tree.rootIdsByProjectId[projectId] ?? [];
  const items: Record<string, PageTreeItemData> = {
    [rootItemId]: {
      id: rootItemId,
      title: '',
      projectId,
      parentPageId: null,
      childrenIds: rootChildren,
      canHaveChildren: true,
      hasChildren: rootChildren.length > 0,
      synthetic: true,
    },
  };

  for (const [id, page] of Object.entries(tree.nodesById)) {
    if (page.projectId !== projectId) continue;
    const childrenIds = tree.childIdsByParentId[id] ?? [];
    items[id] = {
      id,
      title: getPageDisplayTitle(page.title),
      projectId,
      parentPageId: page.parentPageId,
      childrenIds,
      canHaveChildren: true,
      hasChildren: childrenIds.length > 0,
      synthetic: false,
    };
  }

  return { projectId, rootItemId, items };
}

export function selectPage(
  tree: NormalizedPageTree,
  pageId: string | null | undefined,
): NormalizedPage | undefined {
  return pageId ? tree.nodesById[pageId] : undefined;
}

export function getAncestorChain(tree: NormalizedPageTree, pageId: string): NormalizedPage[] {
  const ancestors: NormalizedPage[] = [];
  const visited = new Set<string>([pageId]);
  let parentId = tree.parentIdById[pageId];

  while (parentId) {
    if (visited.has(parentId)) break;
    const parent = tree.nodesById[parentId];
    if (!parent) break;
    ancestors.unshift(parent);
    visited.add(parentId);
    parentId = tree.parentIdById[parentId];
  }

  return ancestors;
}

export function getBreadcrumbs(tree: NormalizedPageTree, pageId: string): PageBreadcrumb[] {
  const page = tree.nodesById[pageId];
  if (!page) return [];

  return [...getAncestorChain(tree, pageId), page].map((item) => ({
    id: item.id,
    title: getPageDisplayTitle(item.title),
  }));
}

export function getPageDisplayTitle(title: string): string {
  return title.trim() || UNTITLED_PAGE_LABEL;
}

export function insertPageIntoTree(
  tree: readonly PageTreeNodeDto[],
  page: PageDto,
): PageTreeNodeDto[] {
  const node: PageTreeNodeDto = { ...page, children: [] };

  if (page.parentPageId === null) return [...tree, node];

  const result = updateChildren(tree, page.parentPageId, (children) => [...children, node]);
  return result.changed ? result.nodes : [...tree];
}

export function renamePageInTree(
  tree: readonly PageTreeNodeDto[],
  pageId: string,
  title: string,
): PageTreeNodeDto[] {
  return renamePageNodes(tree, pageId, title).nodes;
}

export function toMoveIntent(pageId: string, target: PageDropTarget): MoveIntent {
  if (target.type === 'insertion') {
    return {
      pageId,
      projectId: target.projectId,
      parentPageId: target.parentPageId,
      index: target.index,
    };
  }

  return {
    pageId,
    projectId: target.projectId,
    parentPageId: target.parentPageId,
    index: target.childCount,
  };
}

export function isMoveIntentValid(tree: NormalizedPageTree, intent: MoveIntent): boolean {
  const page = tree.nodesById[intent.pageId];
  if (
    !page ||
    page.projectId !== intent.projectId ||
    !Number.isInteger(intent.index) ||
    intent.index < 0
  ) {
    return false;
  }

  if (intent.parentPageId === intent.pageId) return false;

  if (intent.parentPageId) {
    const parent = tree.nodesById[intent.parentPageId];
    if (!parent || parent.projectId !== intent.projectId) return false;
    if (isDescendant(tree, intent.pageId, parent.id)) return false;
  }

  const siblings = getMoveTargetSiblings(tree, intent);
  return intent.index <= siblings.length;
}

export function mapMoveIntentToDto(
  tree: NormalizedPageTree,
  intent: MoveIntent,
): MovePageDto | null {
  if (!isMoveIntentValid(tree, intent)) return null;

  const siblings = getMoveTargetSiblings(tree, intent);
  return {
    parentPageId: intent.parentPageId,
    previousSiblingId: siblings[intent.index - 1] ?? null,
    nextSiblingId: siblings[intent.index] ?? null,
  };
}

export function movePageInTree(
  tree: readonly PageTreeNodeDto[],
  intent: MoveIntent,
): PageTreeNodeDto[] {
  const normalized = normalizePageTree(tree);
  if (!isMoveIntentValid(normalized, intent)) return [...tree];

  const removed = removePage(tree, intent.pageId);
  if (!removed.page) return [...tree];

  const movedPage = { ...removed.page, parentPageId: intent.parentPageId };
  if (intent.parentPageId === null) {
    const roots = [...removed.nodes];
    const projectRootIndexes = roots
      .map((node, index) => ({ index, node }))
      .filter(({ node }) => node.projectId === intent.projectId);
    const lastProjectRootIndex = projectRootIndexes.at(-1)?.index;
    const insertionIndex =
      projectRootIndexes[intent.index]?.index ??
      (lastProjectRootIndex === undefined ? roots.length : lastProjectRootIndex + 1);
    roots.splice(insertionIndex, 0, movedPage);
    return roots;
  }

  const inserted = updateChildren(removed.nodes, intent.parentPageId, (children) => {
    const next = [...children];
    next.splice(intent.index, 0, movedPage);
    return next;
  });

  return inserted.changed ? inserted.nodes : [...tree];
}

export function collectPageSubtreeIds(tree: NormalizedPageTree, pageId: string): readonly string[] {
  if (!tree.nodesById[pageId]) return [];

  const ids: string[] = [];
  const pending = [pageId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    pending.push(...(tree.childIdsByParentId[id] ?? []));
  }

  return ids;
}

export function isPageInSubtree(
  tree: NormalizedPageTree,
  subtreeRootPageId: string,
  pageId: string,
): boolean {
  if (subtreeRootPageId === pageId) return Boolean(tree.nodesById[pageId]);
  return collectPageSubtreeIds(tree, subtreeRootPageId).includes(pageId);
}

export function removePageSubtreeFromTree(
  tree: readonly PageTreeNodeDto[],
  pageId: string,
): PageTreeNodeDto[] {
  return removePage(tree, pageId).nodes;
}

export function removeProjectPagesFromTree(
  tree: readonly PageTreeNodeDto[],
  projectId: string,
): PageTreeNodeDto[] {
  const next = tree
    .filter((node) => node.projectId !== projectId)
    .map((node) => removeProjectPagesFromNode(node, projectId));

  return next;
}

function getMoveTargetSiblings(tree: NormalizedPageTree, intent: MoveIntent): string[] {
  const siblings = intent.parentPageId
    ? (tree.childIdsByParentId[intent.parentPageId] ?? [])
    : (tree.rootIdsByProjectId[intent.projectId] ?? []);
  return siblings.filter((id) => id !== intent.pageId);
}

function isDescendant(tree: NormalizedPageTree, pageId: string, candidateId: string): boolean {
  const pending = [...(tree.childIdsByParentId[pageId] ?? [])];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    if (id === candidateId) return true;
    visited.add(id);
    pending.push(...(tree.childIdsByParentId[id] ?? []));
  }

  return false;
}

function renamePageNodes(
  nodes: readonly PageTreeNodeDto[],
  pageId: string,
  title: string,
): { nodes: PageTreeNodeDto[]; changed: boolean } {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === pageId) {
      changed = true;
      return { ...node, title };
    }

    const childResult = renamePageNodes(node.children, pageId, title);
    if (childResult.changed) {
      changed = true;
      return { ...node, children: childResult.nodes };
    }
    return node;
  });

  return { nodes: changed ? next : [...nodes], changed };
}

function updateChildren(
  nodes: readonly PageTreeNodeDto[],
  parentId: string,
  update: (children: readonly PageTreeNodeDto[]) => PageTreeNodeDto[],
): { nodes: PageTreeNodeDto[]; changed: boolean } {
  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === parentId) {
      changed = true;
      return { ...node, children: update(node.children) };
    }

    const childResult = updateChildren(node.children, parentId, update);
    if (childResult.changed) {
      changed = true;
      return { ...node, children: childResult.nodes };
    }
    return node;
  });

  return { nodes: changed ? next : [...nodes], changed };
}

function removePage(
  nodes: readonly PageTreeNodeDto[],
  pageId: string,
): { nodes: PageTreeNodeDto[]; page?: PageTreeNodeDto } {
  const directIndex = nodes.findIndex((node) => node.id === pageId);
  if (directIndex >= 0) {
    const page = nodes[directIndex];
    if (!page) return { nodes: [...nodes] };
    const next = [...nodes];
    next.splice(directIndex, 1);
    return { nodes: next, page };
  }

  for (const [index, node] of nodes.entries()) {
    const childResult = removePage(node.children, pageId);
    if (childResult.page) {
      const next = [...nodes];
      next[index] = { ...node, children: childResult.nodes };
      return { nodes: next, page: childResult.page };
    }
  }

  return { nodes: [...nodes] };
}

function removeProjectPagesFromNode(node: PageTreeNodeDto, projectId: string): PageTreeNodeDto {
  return {
    ...node,
    children: node.children
      .filter((child) => child.projectId !== projectId)
      .map((child) => removeProjectPagesFromNode(child, projectId)),
  };
}
