'use client';

import type { ItemInstance } from '@headless-tree/core';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  type PageDeleteRequest,
  PageDraft,
  type ProjectDeleteRequest,
} from '@/features/workspace-management';
import { Button, Input, Menu, MenuItem, MenuPopup, MenuTrigger } from '@/shared/ui';
import type { WorkspaceTreeItemData } from '../model/workspace-tree';

type WorkspaceTreeItemProps = Readonly<{
  active: boolean;
  createDraft: boolean;
  createDraftError: string | undefined;
  createDraftPending: boolean;
  createDraftTitle: string;
  indentPx: number;
  item: ItemInstance<WorkspaceTreeItemData>;
  renameError: string | undefined;
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onChangeCreate: (value: string) => void;
  onCompleteRename: () => void;
  onCreateChild: () => void;
  onRequestDeletePage: (request: PageDeleteRequest) => void;
  onRequestDeleteProject: (request: ProjectDeleteRequest) => void;
  onStartMove: (returnFocus: HTMLElement | undefined) => void;
  onSubmitCreate: () => void;
}>;

export function WorkspaceTreeItem({
  active,
  createDraft,
  createDraftError,
  createDraftPending,
  createDraftTitle,
  indentPx,
  item,
  renameError,
  onCancelCreate,
  onCancelRename,
  onChangeCreate,
  onCompleteRename,
  onCreateChild,
  onRequestDeletePage,
  onRequestDeleteProject,
  onStartMove,
  onSubmitCreate,
}: WorkspaceTreeItemProps) {
  const actionsRef = useRef<HTMLButtonElement>(null);
  const moveRequestRef = useRef<{ returnFocus: HTMLElement | undefined } | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const data = item.getItemData();
  const level = item.getItemMeta().level;
  const itemProps = item.getProps();
  const isPage = data.kind === 'page';

  return (
    <>
      <div
        {...itemProps}
        role="treeitem"
        tabIndex={itemProps.tabIndex ?? -1}
        className={`group flex min-h-9 items-center gap-1 rounded-md pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
        }`}
        style={{ paddingLeft: `${Math.max(0, level) * indentPx}px` }}
        onClick={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if ((event.target as HTMLElement).closest('button, input')) return;
          itemProps.onClick?.(event);
        }}
        onKeyDown={(event) => {
          itemProps.onKeyDown?.(event);
          if (event.target === event.currentTarget && event.key === 'Enter') {
            event.preventDefault();
            item.primaryAction();
          }
        }}
      >
        {data.hasChildren ? (
          <button
            aria-label={item.isExpanded() ? `Свернуть ${data.title}` : `Раскрыть ${data.title}`}
            className="size-7 shrink-0 rounded text-muted-foreground"
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
        ) : (
          <span aria-hidden="true" className="size-7 shrink-0" />
        )}

        {isPage && item.isRenaming() ? (
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
          <span className={`min-w-0 flex-1 truncate text-sm ${isPage ? '' : 'font-medium'}`}>
            {data.title}
          </span>
        )}

        {isPage ? (
          <>
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
              open={menuOpen}
              onOpenChange={setMenuOpen}
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
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(true);
                }}
              >
                <MoreHorizontal aria-hidden="true" />
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
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!data.pageId) return;
                    onRequestDeletePage({
                      pageId: data.pageId,
                      returnFocus: actionsRef.current ?? undefined,
                      title: data.title,
                    });
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Удалить
                </MenuItem>
              </MenuPopup>
            </Menu>
          </>
        ) : (
          <>
            <Button
              aria-label={`Создать страницу в ${data.title}`}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onCreateChild();
              }}
            >
              <HugeiconsIcon aria-hidden="true" icon={PlusSignIcon} strokeWidth={2} />
            </Button>
            <Menu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
              <MenuTrigger
                ref={actionsRef}
                aria-label={`Действия для проекта ${data.title}`}
                render={<Button size="icon-sm" variant="ghost" />}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(true);
                }}
              >
                <MoreHorizontal aria-hidden="true" />
              </MenuTrigger>
              <MenuPopup sideOffset={4}>
                <MenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!data.projectId) return;
                    onRequestDeleteProject({
                      name: data.title,
                      projectId: data.projectId,
                      returnFocus: actionsRef.current ?? undefined,
                    });
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Удалить проект
                </MenuItem>
              </MenuPopup>
            </Menu>
          </>
        )}
      </div>

      {createDraft ? (
        <div style={{ paddingLeft: `${(level + 1) * indentPx}px` }}>
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
