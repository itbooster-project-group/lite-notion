'use client';

import type { ItemInstance } from '@headless-tree/core';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { PageCapabilities } from '@/entities/page';
import { PageAccessMenuItem } from '@/features/page-access';
import {
  type PageDeleteRequest,
  PageDraft,
  type ProjectDeleteRequest,
} from '@/features/workspace-management';
import { Button, Input, Menu, MenuItem, MenuPopup, MenuTrigger, Tooltip } from '@/shared/ui';
import type { WorkspaceTreeItemData } from '../model/workspace-tree';

type WorkspaceTreeItemProps = Readonly<{
  active: boolean;
  createDraft: boolean;
  createDraftError: string | undefined;
  createDraftPending: boolean;
  createDraftTitle: string;
  capabilities: PageCapabilities;
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
  onOpenPageAccess: () => void;
  onStartMove: (returnFocus: HTMLElement | undefined) => void;
  onSubmitCreate: () => void;
}>;

export function WorkspaceTreeItem({
  active,
  createDraft,
  createDraftError,
  createDraftPending,
  createDraftTitle,
  capabilities,
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
  onOpenPageAccess,
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
          <Tooltip label={item.isExpanded() ? `Свернуть ${data.title}` : `Раскрыть ${data.title}`}>
            <button
              aria-label={item.isExpanded() ? `Свернуть ${data.title}` : `Раскрыть ${data.title}`}
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground disabled:cursor-default aria-disabled:cursor-default"
              tabIndex={-1}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (item.isExpanded()) item.collapse();
                else item.expand();
              }}
            >
              {item.isExpanded() ? (
                <ChevronDown aria-hidden="true" className="pointer-events-none size-4 shrink-0" />
              ) : (
                <ChevronRight aria-hidden="true" className="pointer-events-none size-4 shrink-0" />
              )}
            </button>
          </Tooltip>
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
            {capabilities.canMovePage ? (
              <Tooltip label={`Перетащить ${data.title}`}>
                <button
                  {...item.getDragHandleProps()}
                  aria-label={`Перетащить ${data.title}`}
                  className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 focus:opacity-100 disabled:cursor-default aria-disabled:cursor-default group-hover:opacity-100"
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical
                    aria-hidden="true"
                    className="pointer-events-none size-4 shrink-0"
                  />
                </button>
              </Tooltip>
            ) : null}
            {(capabilities.canCreateChild ||
              capabilities.canRenamePage ||
              capabilities.canMovePage ||
              capabilities.canDeletePage ||
              capabilities.canManageAccess) && (
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
                  {capabilities.canCreateChild ? (
                    <MenuItem onClick={onCreateChild}>Добавить дочернюю</MenuItem>
                  ) : null}
                  {capabilities.canRenamePage ? (
                    <MenuItem onClick={() => item.startRenaming()}>Переименовать</MenuItem>
                  ) : null}
                  {capabilities.canMovePage ? (
                    <MenuItem
                      onClick={() => {
                        moveRequestRef.current = { returnFocus: actionsRef.current ?? undefined };
                      }}
                    >
                      Переместить…
                    </MenuItem>
                  ) : null}
                  {capabilities.canDeletePage ? (
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
                  ) : null}
                  {capabilities.canManageAccess ? (
                    <PageAccessMenuItem onSelect={onOpenPageAccess} />
                  ) : null}
                </MenuPopup>
              </Menu>
            )}
          </>
        ) : (
          <>
            {capabilities.canCreateChild ? (
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
                <Plus aria-hidden="true" />
              </Button>
            ) : null}
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
