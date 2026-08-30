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
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  Text,
} from '@/shared/ui';
import { toMoveIntent } from '../model/drop-target';
import { parsePageTitle } from '../model/page-title-schema';
import {
  getAncestorChain,
  isMoveIntentValid,
  type MoveIntent,
  type NormalizedPageTree,
  type ProjectTree,
  type ProjectTreeItem,
} from '../model/page-tree';

export type PageTreeProps = Readonly<{
  activePageId: string | undefined;
  header?: ReactNode;
  normalizedTree: NormalizedPageTree;
  onCreatePage: (parentPageId: string | null, title: string) => Promise<void>;
  onMovePage: (intent: MoveIntent) => Promise<void>;
  onRenamePage: (pageId: string, title: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  projectTree: ProjectTree;
}>;

export function PageTree({
  activePageId,
  header,
  normalizedTree,
  onCreatePage,
  onMovePage,
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
    childrenIds: [],
    id: projectTree.rootItemId,
    parentPageId: null,
    projectId: '',
    synthetic: true,
    title: '',
  };

  const tree = useTree<ProjectTreeItem>({
    canDrag: (items) => items.length === 1 && !items[0]?.getItemData().synthetic,
    canDrop: (items, target) => {
      const pageId = items[0]?.getId();
      return pageId
        ? isMoveIntentValid(normalizedTree, toMoveIntent(pageId, toPageDropTarget(target)))
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
    indent: 16,
    isItemFolder: (item) =>
      item.getItemData().synthetic || item.getItemData().childrenIds.length > 0,
    onDrop: async (items, target) => {
      const pageId = items[0]?.getId();
      if (!pageId || treeMovePendingRef.current) return;
      treeMovePendingRef.current = true;
      setTreeMoveError(undefined);
      try {
        await onMovePage(toMoveIntent(pageId, toPageDropTarget(target)));
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

  async function submitRename(item: ItemInstance<ProjectTreeItem>, value: string) {
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
          <PageTreeRow
            actionsOpen={actionsPageId === item.getId()}
            active={item.getId() === activePageId}
            createDraft={draftParentId === item.getId()}
            createDraftError={draftError}
            createDraftPending={creating}
            createDraftTitle={draftTitle}
            item={item}
            key={item.getKey()}
            renameError={renameError}
            onCancelCreate={() => setDraftParentId(undefined)}
            onCancelRename={() => tree.abortRenaming()}
            onChangeCreate={setDraftTitle}
            onCompleteRename={() => tree.completeRenaming()}
            onCreateChild={() => startDraft(item.getId())}
            onActionsOpenChange={(open) => setActionsPageId(open ? item.getId() : undefined)}
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

type PageTreeRowProps = Readonly<{
  actionsOpen: boolean;
  active: boolean;
  createDraft: boolean;
  createDraftError: string | undefined;
  createDraftPending: boolean;
  createDraftTitle: string;
  item: ItemInstance<ProjectTreeItem>;
  renameError: string | undefined;
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onChangeCreate: (value: string) => void;
  onCompleteRename: () => void;
  onCreateChild: () => void;
  onActionsOpenChange: (open: boolean) => void;
  onStartMove: (returnFocus: HTMLElement | undefined) => void;
  onSubmitCreate: () => void;
}>;

function PageTreeRow({
  actionsOpen,
  active,
  createDraft,
  createDraftError,
  createDraftPending,
  createDraftTitle,
  item,
  renameError,
  onCancelCreate,
  onCancelRename,
  onChangeCreate,
  onCompleteRename,
  onCreateChild,
  onActionsOpenChange,
  onStartMove,
  onSubmitCreate,
}: PageTreeRowProps) {
  const actionsRef = useRef<HTMLButtonElement>(null);
  const moveRequestRef = useRef<{ returnFocus: HTMLElement | undefined } | undefined>(undefined);
  const data = item.getItemData();
  const level = item.getItemMeta().level;
  const itemProps = item.getProps();

  return (
    <>
      <div
        {...itemProps}
        role="treeitem"
        tabIndex={item.isFocused() ? 0 : -1}
        className={`group flex min-h-9 items-center gap-1 rounded-md pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
        }`}
        style={{ paddingLeft: `${Math.max(0, level) * 16}px` }}
        onKeyDown={(event) => {
          itemProps.onKeyDown?.(event);
          if (event.target === event.currentTarget && event.key === 'Enter') {
            event.preventDefault();
            item.primaryAction();
          }
        }}
      >
        <button
          aria-label={item.isExpanded() ? `Свернуть ${data.title}` : `Раскрыть ${data.title}`}
          className="size-7 shrink-0 rounded text-muted-foreground disabled:invisible"
          disabled={!item.isFolder()}
          tabIndex={-1}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (item.isExpanded()) item.collapse();
            else item.expand();
          }}
        >
          {item.isExpanded() ? '▾' : '▸'}
        </button>

        {item.isRenaming() ? (
          <Input
            {...item.getRenameInputProps()}
            aria-invalid={Boolean(renameError)}
            className="h-7 min-w-0 flex-1"
            maxLength={255}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                onCompleteRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCancelRename();
              }
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm">{data.title}</span>
        )}

        <button
          {...item.getDragHandleProps()}
          aria-label={`Перетащить ${data.title}`}
          className="size-7 shrink-0 rounded text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100"
          type="button"
          onClick={(event) => event.stopPropagation()}
        >
          ⋮⋮
        </button>

        <Menu
          modal={false}
          open={actionsOpen}
          onOpenChange={onActionsOpenChange}
          onOpenChangeComplete={(open) => {
            if (open || !moveRequestRef.current) return;
            const { returnFocus } = moveRequestRef.current;
            moveRequestRef.current = undefined;
            onStartMove(returnFocus);
          }}
        >
          <MenuTrigger
            ref={actionsRef}
            aria-label={`Действия для ${data.title}`}
            render={<Button size="icon-sm" variant="ghost" />}
            onClick={(event) => event.stopPropagation()}
          >
            ⋯
          </MenuTrigger>
          <MenuPopup sideOffset={4}>
            <MenuItem onClick={onCreateChild}>Добавить дочернюю</MenuItem>
            <MenuItem onClick={() => item.startRenaming()}>Переименовать</MenuItem>
            <MenuItem
              onClick={() => {
                moveRequestRef.current = { returnFocus: actionsRef.current ?? undefined };
              }}
            >
              Переместить…
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {createDraft ? (
        <div style={{ paddingLeft: `${(level + 1) * 16}px` }}>
          <PageDraft
            error={createDraftError}
            pending={createDraftPending}
            value={createDraftTitle}
            onCancel={onCancelCreate}
            onChange={onChangeCreate}
            onSubmit={onSubmitCreate}
          />
        </div>
      ) : null}
    </>
  );
}

type PageDraftProps = Readonly<{
  error: string | undefined;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  value: string;
}>;

function PageDraft({ error, onCancel, onChange, onSubmit, pending, value }: PageDraftProps) {
  return (
    <div className="space-y-1 rounded-md border bg-background p-2">
      <Input
        autoFocus
        aria-label="Название новой страницы"
        aria-invalid={Boolean(error)}
        disabled={pending}
        maxLength={255}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {error ? (
        <Text role="alert" variant="error">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

type MovePageDialogProps = Readonly<{
  normalizedTree: NormalizedPageTree;
  onClose: () => void;
  onMove: (intent: MoveIntent) => Promise<void>;
  pageId: string | undefined;
  projectTree: ProjectTree;
  returnFocus: HTMLElement | undefined;
}>;

function MovePageDialog({
  normalizedTree,
  onClose,
  onMove,
  pageId,
  projectTree,
  returnFocus,
}: MovePageDialogProps) {
  const [parentPageId, setParentPageId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (pageId) {
      setParentPageId(null);
      setIndex(0);
      setError(undefined);
    }
  }, [pageId]);

  const parentOptions = useMemo(() => {
    if (!pageId) return [];
    return Object.values(projectTree.items).filter(
      (item) =>
        !item.synthetic &&
        isMoveIntentValid(normalizedTree, { index: 0, pageId, parentPageId: item.id }),
    );
  }, [normalizedTree, pageId, projectTree.items]);

  const siblingIds = pageId
    ? (parentPageId
        ? (projectTree.items[parentPageId]?.childrenIds ?? [])
        : (projectTree.items[projectTree.rootItemId]?.childrenIds ?? [])
      ).filter((id) => id !== pageId)
    : [];

  async function submitMove() {
    if (!pageId || pendingRef.current) return;
    const intent = { index, pageId, parentPageId } satisfies MoveIntent;
    if (!isMoveIntentValid(normalizedTree, intent)) {
      setError('Выберите допустимое место для страницы.');
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onMove(intent);
      onClose();
    } catch {
      setError('Ошибка перемещения страницы. Попробуйте ещё раз.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(pageId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent finalFocus={() => returnFocus ?? true} showCloseButton={false}>
        <DialogTitle>Переместить страницу</DialogTitle>
        <DialogDescription>
          Выберите нового родителя и позицию среди его дочерних страниц.
        </DialogDescription>

        <div className="mt-5 space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            <span>Родитель</span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-3"
              value={parentPageId ?? ''}
              onChange={(event) => {
                setParentPageId(event.target.value || null);
                setIndex(0);
              }}
            >
              <option value="">Корень проекта</option>
              {parentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-sm font-medium">
            <span>Позиция</span>
            <select
              className="h-9 w-full rounded-lg border bg-background px-3"
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              <option value={0}>В начало</option>
              {siblingIds.map((siblingId, siblingIndex) => (
                <option key={siblingId} value={siblingIndex + 1}>
                  После {projectTree.items[siblingId]?.title ?? 'страницы'}
                </option>
              ))}
            </select>
          </label>

          {error ? (
            <Text role="alert" variant="error">
              {error}
            </Text>
          ) : null}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Отмена</DialogClose>
            <Button disabled={pending} type="button" onClick={() => void submitMove()}>
              {pending ? 'Перемещаем…' : 'Переместить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toPageDropTarget(target: DragTarget<ProjectTreeItem>) {
  const targetData = target.item.getItemData();
  if (isOrderedDragTarget(target)) {
    return {
      index: target.insertionIndex,
      parentPageId: targetData.synthetic ? null : targetData.id,
      type: 'insertion' as const,
    };
  }

  return {
    childCount: targetData.childrenIds.length,
    pageId: targetData.synthetic ? null : targetData.id,
    type: 'item' as const,
  };
}
