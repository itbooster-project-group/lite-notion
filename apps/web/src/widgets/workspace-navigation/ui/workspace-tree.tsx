'use client';

import {
  type DragTarget,
  dragAndDropFeature,
  hotkeysCoreFeature,
  type ItemInstance,
  isOrderedDragTarget,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from '@headless-tree/core';
import { AssistiveTreeDescription, useTree } from '@headless-tree/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildProjectPageTree,
  getAncestorChain,
  isMoveIntentValid,
  type MoveIntent,
  type NormalizedPageTree,
  type PageDropTarget,
  parsePageTitle,
  toMoveIntent,
} from '@/entities/page';
import {
  MovePageDialog,
  type PageDeleteRequest,
  type ProjectDeleteRequest,
} from '@/features/workspace-management';
import type { ProjectDto } from '@/shared/api';
import { workspacePagePath, workspaceProjectPath } from '@/shared/routing';
import { Text, TREE_INDENT_PX } from '@/shared/ui';
import {
  buildWorkspaceTree,
  getPageItemId,
  getProjectItemId,
  type WorkspaceTreeItemData,
} from '../model/workspace-tree';
import { useWorkspaceTreeExpansion } from '../model/workspace-tree-expansion';
import { WorkspaceTreeItem } from './workspace-tree-item';

type WorkspaceTreeProps = Readonly<{
  activePageId: string | undefined;
  activeProjectId: string | undefined;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (projectId: string, parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onNavigate?: () => void;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onRequestDeletePage: (request: PageDeleteRequest) => void;
  onRequestDeleteProject: (request: ProjectDeleteRequest) => void;
  projects: readonly ProjectDto[];
}>;

type PageDraftTarget = Readonly<{
  parentPageId: string | null;
  projectId: string;
}>;

export function WorkspaceTree({
  activePageId,
  activeProjectId,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onNavigate,
  onRenamePage,
  onRequestDeletePage,
  onRequestDeleteProject,
  projects,
}: WorkspaceTreeProps) {
  const router = useRouter();
  const model = useMemo(
    () => buildWorkspaceTree(projects, normalizedTree),
    [normalizedTree, projects],
  );
  const { setState: setExpansionState, state: expansionState } = useWorkspaceTreeExpansion();
  const activeItemId = activePageId
    ? getPageItemId(activePageId)
    : activeProjectId
      ? getProjectItemId(activeProjectId)
      : undefined;
  const [focusedItem, setFocusedItem] = useState<string | null>(activeItemId ?? null);
  const [renamingItem, setRenamingItem] = useState<string | null>();
  const [renamingValue, setRenamingValue] = useState<string>();
  const [renameError, setRenameError] = useState<string>();
  const [draftTarget, setDraftTarget] = useState<PageDraftTarget>();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [movingPageId, setMovingPageId] = useState<string>();
  const [moveReturnFocus, setMoveReturnFocus] = useState<HTMLElement>();
  const treeMovePendingRef = useRef(false);
  const [treeMoveError, setTreeMoveError] = useState<string>();

  const projectItemIds = useMemo(
    () => projects.map((project) => getProjectItemId(project.id)),
    [projects],
  );

  useEffect(() => {
    setExpansionState((current) => {
      const newProjectItems = projectItemIds.filter(
        (itemId) => !current.knownProjectItems.includes(itemId),
      );
      if (newProjectItems.length === 0) return current;
      return {
        expandedItems: [...new Set([...current.expandedItems, ...newProjectItems])],
        knownProjectItems: [...new Set([...current.knownProjectItems, ...newProjectItems])],
      };
    });
  }, [projectItemIds, setExpansionState]);

  useEffect(() => {
    if (!activeItemId) return;
    setFocusedItem(activeItemId);
    const activePage = activePageId ? normalizedTree.nodesById[activePageId] : undefined;
    const projectId = activeProjectId ?? activePage?.projectId;
    const ancestorIds = activePageId
      ? getAncestorChain(normalizedTree, activePageId).map((page) => getPageItemId(page.id))
      : [];
    const requiredItems = projectId ? [getProjectItemId(projectId), ...ancestorIds] : ancestorIds;
    setExpansionState((current) => ({
      ...current,
      expandedItems: [...new Set([...current.expandedItems, ...requiredItems])],
    }));
  }, [activeItemId, activePageId, activeProjectId, normalizedTree, setExpansionState]);

  const rootData = model.items[model.rootItemId] ?? {
    canHaveChildren: true,
    childrenIds: [],
    hasChildren: false,
    id: model.rootItemId,
    kind: 'root' as const,
    pageId: null,
    parentPageId: null,
    projectId: null,
    title: '',
  };

  const tree = useTree<WorkspaceTreeItemData>({
    canDrag: (items) => items.length === 1 && items[0]?.getItemData().kind === 'page',
    canDrop: (items, target) => {
      const pageId = items[0]?.getItemData().pageId;
      const dropTarget = toWorkspaceDropTarget(target);
      return pageId && dropTarget
        ? isMoveIntentValid(normalizedTree, toMoveIntent(pageId, dropTarget))
        : false;
    },
    canRename: (item) => item.getItemData().kind === 'page',
    dataLoader: {
      getChildren: (itemId) => model.items[itemId]?.childrenIds.slice() ?? [],
      getItem: (itemId) => model.items[itemId] ?? rootData,
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      renamingFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
    ],
    getItemName: (item) => item.getItemData().title,
    indent: TREE_INDENT_PX,
    isItemFolder: (item) => item.getItemData().canHaveChildren,
    onDrop: async (items, target) => {
      const pageId = items[0]?.getItemData().pageId;
      const dropTarget = toWorkspaceDropTarget(target);
      if (!pageId || !dropTarget || treeMovePendingRef.current) return;
      treeMovePendingRef.current = true;
      setTreeMoveError(undefined);
      try {
        await onMovePage(toMoveIntent(pageId, dropTarget));
      } catch {
        setTreeMoveError('Ошибка перемещения страницы. Попробуйте ещё раз.');
      } finally {
        treeMovePendingRef.current = false;
      }
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (data.kind === 'project' && data.projectId) {
        onNavigate?.();
        router.push(workspaceProjectPath(data.projectId));
      }
      if (data.kind === 'page' && data.pageId) {
        onNavigate?.();
        router.push(workspacePagePath(data.pageId));
      }
    },
    onRename: (item, value) => {
      void submitRename(item, value);
    },
    rootItemId: model.rootItemId,
    seperateDragHandle: true,
    setExpandedItems: (next) =>
      setExpansionState((current) => ({
        ...current,
        expandedItems: typeof next === 'function' ? next(current.expandedItems) : next,
      })),
    setFocusedItem,
    setRenamingItem,
    setRenamingValue,
    state: {
      expandedItems: expansionState.expandedItems,
      focusedItem,
      selectedItems: activeItemId ? [activeItemId] : [],
      ...(renamingItem !== undefined ? { renamingItem } : {}),
      ...(renamingValue !== undefined ? { renamingValue } : {}),
    },
  });

  async function submitRename(item: ItemInstance<WorkspaceTreeItemData>, value: string) {
    const pageId = item.getItemData().pageId;
    if (!pageId) return;
    const parsed = parsePageTitle(value);
    if (!parsed.title) {
      setRenameError(parsed.error);
      queueMicrotask(() => {
        setRenamingItem(item.getId());
        setRenamingValue(value);
      });
      return;
    }

    setRenameError(undefined);
    try {
      await onRenamePage(pageId, parsed.title);
    } catch {
      setRenameError('Ошибка переименования страницы. Попробуйте ещё раз.');
      setRenamingItem(item.getId());
      setRenamingValue(parsed.title);
    }
  }

  async function submitCreate() {
    if (!draftTarget || creatingRef.current) return;
    const parsed = parsePageTitle(draftTitle);
    if (!parsed.title) {
      setDraftError(parsed.error);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setDraftError(undefined);
    try {
      await onCreatePage(draftTarget.projectId, draftTarget.parentPageId, parsed.title);
      setDraftTarget(undefined);
      setDraftTitle('');
    } catch {
      setDraftError('Ошибка создания страницы. Попробуйте ещё раз.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  function startDraft(projectId: string, parentPageId: string | null) {
    setDraftTarget({ parentPageId, projectId });
    setDraftTitle('');
    setDraftError(undefined);
    const itemId = parentPageId ? getPageItemId(parentPageId) : getProjectItemId(projectId);
    setExpansionState((current) => ({
      ...current,
      expandedItems: [...new Set([...current.expandedItems, itemId])],
    }));
  }

  const movingPage = movingPageId ? normalizedTree.nodesById[movingPageId] : undefined;
  const movingProjectTree = buildProjectPageTree(
    normalizedTree,
    movingPage?.projectId ?? 'unavailable',
  );
  const items = tree.getItems().filter((item) => item.getId() !== model.rootItemId);

  return (
    <div className="space-y-2">
      <div {...tree.getContainerProps('Проекты и страницы')} className="space-y-0.5">
        {items.map((item) => {
          const data = item.getItemData();
          const pageId = data.pageId;
          const createDraft = Boolean(
            draftTarget &&
              draftTarget.projectId === data.projectId &&
              draftTarget.parentPageId === pageId &&
              ((data.kind === 'project' && pageId === null) || data.kind === 'page'),
          );
          return (
            <WorkspaceTreeItem
              active={item.getId() === activeItemId}
              createDraft={createDraft}
              createDraftError={draftError}
              createDraftPending={creating}
              createDraftTitle={draftTitle}
              indentPx={TREE_INDENT_PX}
              item={item}
              key={item.getKey()}
              renameError={renameError}
              onCancelCreate={() => setDraftTarget(undefined)}
              onCancelRename={() => tree.abortRenaming()}
              onChangeCreate={setDraftTitle}
              onCompleteRename={() => tree.completeRenaming()}
              onCreateChild={() => {
                if (data.projectId) startDraft(data.projectId, pageId);
              }}
              onRequestDeletePage={onRequestDeletePage}
              onRequestDeleteProject={onRequestDeleteProject}
              onStartMove={(returnFocus) => {
                setMoveReturnFocus(returnFocus);
                setMovingPageId(pageId ?? undefined);
              }}
              onSubmitCreate={() => void submitCreate()}
            />
          );
        })}
        <AssistiveTreeDescription className="sr-only" tree={tree} />
      </div>

      {renameError || treeMoveError ? (
        <Text role="alert" variant="error">
          {renameError ?? treeMoveError}
        </Text>
      ) : null}

      <MovePageDialog
        normalizedTree={normalizedTree}
        pageId={movingPageId}
        projectTree={movingProjectTree}
        returnFocus={moveReturnFocus}
        onClose={() => setMovingPageId(undefined)}
        onMove={onMovePage}
      />
    </div>
  );
}

function toWorkspaceDropTarget(target: DragTarget<WorkspaceTreeItemData>): PageDropTarget | null {
  const data = target.item.getItemData();
  if (!data.projectId || data.kind === 'root') return null;

  if (isOrderedDragTarget(target)) {
    if (data.kind === 'project') {
      return {
        index: target.insertionIndex,
        parentPageId: null,
        projectId: data.projectId,
        type: 'insertion',
      };
    }
    return {
      index: target.insertionIndex,
      parentPageId: data.pageId,
      projectId: data.projectId,
      type: 'insertion',
    };
  }

  if (data.kind !== 'page' || !data.pageId) return null;
  return {
    childCount: data.childrenIds.length,
    parentPageId: data.pageId,
    projectId: data.projectId,
    type: 'item',
  };
}
