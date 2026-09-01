'use client';

import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  filterPageEditorSlashCommands,
  getPageEditorSlashQuery,
  type PageEditorSlashCommand,
  type PageEditorSlashQuery,
  runPageEditorSlashCommand,
} from '../../model/slash-menu';
import { useEditorPopupPosition } from '../editor-popup-position/use-editor-popup-position';

export type SlashMenuProps = Readonly<{
  editor: Editor;
  onLinkCommand(): void;
  onMediaCommand(mediaType: 'image' | 'video' | 'youtube'): void;
  onKeyDownChange(handler: ((event: KeyboardEvent) => boolean) | undefined): void;
}>;

export function SlashMenu({
  editor,
  onKeyDownChange,
  onLinkCommand,
  onMediaCommand,
}: SlashMenuProps) {
  const [query, setQuery] = useState<PageEditorSlashQuery | undefined>(() =>
    getPageEditorSlashQuery(editor),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const commands = useMemo(
    () => (query ? filterPageEditorSlashCommands(query.query) : []),
    [query],
  );
  const getPopupAnchor = useCallback(
    () => (query ? editor.view.coordsAtPos(query.to) : undefined),
    [editor, query],
  );
  const popup = useEditorPopupPosition({
    editor,
    getAnchor: getPopupAnchor,
    placement: 'below',
  });

  const runCommand = useCallback(
    (command: PageEditorSlashCommand) => {
      if (!query) return;

      if (command.opensLinkForm) {
        editor.chain().focus().deleteRange(query).run();
        setQuery(undefined);
        onLinkCommand();
        return;
      }

      if (command.mediaType) {
        editor.chain().focus().deleteRange(query).run();
        setQuery(undefined);
        onMediaCommand(command.mediaType);
        return;
      }

      runPageEditorSlashCommand(editor, query, command.command);
      setQuery(undefined);
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.commands.focus();
      });
    },
    [editor, onLinkCommand, onMediaCommand, query],
  );

  useEffect(() => {
    const refresh = () => {
      const nextQuery = getPageEditorSlashQuery(editor);
      setQuery(nextQuery);
      setActiveIndex(0);
    };
    refresh();
    editor.on('transaction', refresh);
    editor.on('selectionUpdate', refresh);
    return () => {
      editor.off('transaction', refresh);
      editor.off('selectionUpdate', refresh);
    };
  }, [editor]);

  useEffect(() => {
    function closeMenu() {
      if (!query) return;
      editor.chain().focus().deleteRange(query).run();
      setQuery(undefined);
    }

    const handleKeyDown = (event: KeyboardEvent): boolean => {
      if (!query) return false;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (commands.length ? (index + 1) % commands.length : 0));
        return true;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) =>
          commands.length ? (index - 1 + commands.length) % commands.length : 0,
        );
        return true;
      }
      if (event.key === 'Enter' && commands.length) {
        event.preventDefault();
        const activeCommand = commands[activeIndex];
        if (activeCommand) runCommand(activeCommand);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return true;
      }
      return false;
    };

    onKeyDownChange(handleKeyDown);
    return () => onKeyDownChange(undefined);
  }, [activeIndex, commands, editor, onKeyDownChange, query, runCommand]);

  if (!query || !popup.position) return null;

  return (
    <div
      aria-label="Команды редактора"
      className="fixed z-50 max-h-72 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      ref={popup.floatingRef}
      role="listbox"
      style={popup.position}
    >
      {commands.length ? (
        commands.map((command, index) => (
          <button
            aria-selected={index === activeIndex}
            className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            key={command.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand(command)}
            role="option"
            type="button"
          >
            {command.label}
          </button>
        ))
      ) : (
        <p role="status">Команды не найдены.</p>
      )}
    </div>
  );
}
