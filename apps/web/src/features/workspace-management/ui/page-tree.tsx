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
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  getAncestorChain,
  isMoveIntentValid,
  type MoveIntent,
  type NormalizedPageTree,
  type PageDropTarget,
  type PageTreeItemData,
  type ProjectPageTree,
  parsePageTitle,
  toMoveIntent,
} from '@/entities/page';
import { Button, Text, TREE_INDENT_PX } from '@/shared/ui';
import type { PageDeleteRequest } from '../model/delete-intent';
import { MovePageDialog } from './move-page-dialog';
import { PageDraft } from './page-draft';
import { PageTreeItem } from './page-tree-item';

export type PageTreeProps = Readonly<{
  activePageId: string | undefined;
  header?: ReactNode;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRequestDeletePage: (request: PageDeleteRequest) => void;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  projectTree: ProjectPageTree;
}>;

export function PageTree({
  activePageId,
  header,
  normalizedTree,
  onCreatePage,
  onMovePage,
  onRequestDeletePage,
  onRenamePage,
  onSelectPage,
  projectTree,
}: PageTreeProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [focusedItem, setFocusedItem] = useState<string | null>(activePageId ?? null);
  const [renamingItem, setRenamingItem] = useState<string | null>();
  const [renamingValue, setRenamingValue] = useState<string>();
  const [renameError, setRenameError] = useState<string>();
  const [draftParentId, setDraftParentId] = useState<string | null>();
  const [draftTitle, setDraftTitle] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [movingPageId, setMovingPageId] = useState<string>();
  const [moveReturnFocus, setMoveReturnFocus] = useState<HTMLElement>();
  const [actionsPageId, setActionsPageId] = useState<string>();
  const treeMovePendingRef = useRef(false);
  const [treeMoveError, setTreeMoveError] = useState<string>();

  useEffect(() => {
    setExpandedItems((current) => current.filter((id) => Boolean(projectTree.items[id])));
  }, [projectTree.items]);

  useEffect(() => {
    if (!activePageId) return;
    setFocusedItem(activePageId);
    const ancestorIds = getAncestorChain(normalizedTree, activePageId).map((page) => page.id);
    setExpandedItems((current) => [...new Set([...current, ...ancestorIds])]);
  }, [activePageId, normalizedTree]);

  const rootData = projectTree.items[projectTree.rootItemId] ?? {
    canHaveChildren: true,
    childrenIds: [],
    hasChildren: false,
    id: projectTree.rootItemId,
    parentPageId: null,
    projectId: projectTree.projectId,
    synthetic: true,
    title: '',
  };

  const tree = useTree<PageTreeItemData>({
    canDrag: (items) => items.length === 1 && !items[0]?.getItemData().synthetic,
    canDrop: (items, target) => {
      const pageId = items[0]?.getId();
      const dropTarget = toPageDropTarget(target);
      return pageId && dropTarget
        ? isMoveIntentValid(normalizedTree, toMoveIntent(pageId, dropTarget))
        : false;
    },
    canRename: (item) => !item.getItemData().synthetic,
    dataLoader: {
      getChildren: (itemId) => projectTree.items[itemId]?.childrenIds.slice() ?? [],
      getItem: (itemId) => projectTree.items[itemId] ?? rootData,
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
      const pageId = items[0]?.getId();
      const dropTarget = toPageDropTarget(target);
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
      if (!item.getItemData().synthetic) onSelectPage(item.getId());
    },
    onRename: (item, value) => {
      void submitRename(item, value);
    },
    rootItemId: projectTree.rootItemId,
    seperateDragHandle: true,
    setExpandedItems,
    setFocusedItem,
    setRenamingItem,
    setRenamingValue,
    state: {
      expandedItems,
      focusedItem,
      selectedItems: activePageId ? [activePageId] : [],
      ...(renamingItem !== undefined ? { renamingItem } : {}),
      ...(renamingValue !== undefined ? { renamingValue } : {}),
    },
  });

  async function submitRename(item: ItemInstance<PageTreeItemData>, value: string) {
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
      await onRenamePage(item.getId(), parsed.title);
    } catch {
      setRenameError('Ошибка переименования страницы. Попробуйте ещё раз.');
      setRenamingItem(item.getId());
      setRenamingValue(parsed.title);
    }
  }

  async function submitCreate() {
    if (creatingRef.current) return;
    const parsed = parsePageTitle(draftTitle);
    if (!parsed.title) {
      setDraftError(parsed.error);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setDraftError(undefined);
    try {
      await onCreatePage(draftParentId ?? null, parsed.title);
      setDraftParentId(undefined);
      setDraftTitle('');
    } catch {
      setDraftError('Ошибка создания страницы. Попробуйте ещё раз.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  function startDraft(parentPageId: string | null) {
    setDraftParentId(parentPageId);
    setDraftTitle('');
    setDraftError(undefined);
    if (parentPageId) {
      setExpandedItems((current) => [...new Set([...current, parentPageId])]);
    }
  }

  const items = tree.getItems().filter((item) => item.getId() !== projectTree.rootItemId);

  return (
    <div className="space-y-3">
      <div className="flex min-h-7 items-center gap-2">
        {header ? <div className="min-w-0 flex-1">{header}</div> : <div className="flex-1" />}
        <Button
          aria-label="Создать страницу"
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={() => startDraft(null)}
        >
          <HugeiconsIcon aria-hidden="true" icon={PlusSignIcon} strokeWidth={2} />
        </Button>
      </div>

      {draftParentId === null ? (
        <PageDraft
          error={draftError}
          pending={creating}
          value={draftTitle}
          onCancel={() => setDraftParentId(undefined)}
          onChange={setDraftTitle}
          onSubmit={() => void submitCreate()}
        />
      ) : null}

      <div {...tree.getContainerProps('Страницы проекта')} className="space-y-0.5">
        {items.map((item) => (
          <PageTreeItem
            actionsOpen={actionsPageId === item.getId()}
            active={item.getId() === activePageId}
            createDraft={draftParentId === item.getId()}
            createDraftError={draftError}
            createDraftPending={creating}
            createDraftTitle={draftTitle}
            indentPx={TREE_INDENT_PX}
            item={item}
            key={item.getKey()}
            renameError={renameError}
            onActionsOpenChange={(open) => setActionsPageId(open ? item.getId() : undefined)}
            onCancelCreate={() => setDraftParentId(undefined)}
            onCancelRename={() => tree.abortRenaming()}
            onChangeCreate={setDraftTitle}
            onCompleteRename={() => tree.completeRenaming()}
            onCreateChild={() => startDraft(item.getId())}
            onRequestDelete={onRequestDeletePage}
            onStartMove={(returnFocus) => {
              setMoveReturnFocus(returnFocus);
              setMovingPageId(item.getId());
            }}
            onSubmitCreate={() => void submitCreate()}
          />
        ))}
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
        projectTree={projectTree}
        returnFocus={moveReturnFocus}
        onClose={() => setMovingPageId(undefined)}
        onMove={onMovePage}
      />
    </div>
  );
}

function toPageDropTarget(target: DragTarget<PageTreeItemData>): PageDropTarget | null {
  const targetData = target.item.getItemData();
  if (isOrderedDragTarget(target)) {
    return {
      index: target.insertionIndex,
      parentPageId: targetData.synthetic ? null : targetData.id,
      projectId: targetData.projectId,
      type: 'insertion',
    };
  }

  return {
    childCount: targetData.childrenIds.length,
    parentPageId: targetData.synthetic ? null : targetData.id,
    projectId: targetData.projectId,
    type: 'item',
  };
}
