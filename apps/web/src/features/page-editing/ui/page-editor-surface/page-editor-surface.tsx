'use client';

import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';
import { cn } from '@/shared/lib/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui';

import { shouldShowPageEditorBubbleMenu } from '../../model/bubble-menu';
import { BlockReorderControls } from '../block-reorder-controls';
import { BubbleFormattingMenu } from '../bubble-menu';
import { EditorToolbar } from '../editor-toolbar';
import { LinkForm } from '../link-form';
import { ImageForm, VideoForm, YoutubeForm } from '../media-form';
import { SlashMenu } from '../slash-menu';
import styles from './page-editor-surface.module.css';

export type PageEditorSurfaceProps = Readonly<{
  doc: Y.Doc;
  editable: boolean;
}>;

type BubbleMenuPosition = Readonly<{
  left: number;
  top: number;
}>;

type EditorFormDialogProps = Readonly<{
  children: ReactNode;
  description: string;
  editor: Editor;
  onClose(): void;
  title: string;
}>;

function EditorFormDialog({
  children,
  description,
  editor,
  onClose,
  title,
}: EditorFormDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        finalFocus={() => (editor.isDestroyed ? true : editor.view.dom)}
        showCloseButton={false}
      >
        <div className="space-y-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function PageEditorSurface({ doc, editable }: PageEditorSurfaceProps) {
  const [bubbleMenuPosition, setBubbleMenuPosition] = useState<BubbleMenuPosition | undefined>();
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [imageFormOpen, setImageFormOpen] = useState(false);
  const [videoFormOpen, setVideoFormOpen] = useState(false);
  const [youtubeFormOpen, setYoutubeFormOpen] = useState(false);
  const linkSelectionRef = useRef<Readonly<{ from: number; to: number }> | undefined>(undefined);
  const slashKeyDownHandlerRef = useRef<((event: KeyboardEvent) => boolean) | undefined>(undefined);
  const editor = useEditor(
    {
      editable,
      editorProps: {
        attributes: {
          'aria-label': 'Содержимое страницы',
          class: cn(
            styles.editorContent,
            'min-h-64 w-full max-w-none px-1 py-4 text-sm leading-6 outline-none [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:leading-tight [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:leading-tight [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6',
          ),
          'data-page-editor-content': '',
          role: 'textbox',
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && editable) {
            event.preventDefault();
            linkSelectionRef.current = {
              from: _view.state.selection.from,
              to: _view.state.selection.to,
            };
            setLinkFormOpen(true);
            return true;
          }

          return slashKeyDownHandlerRef.current?.(event) ?? false;
        },
      },
      extensions: createPageDocumentEditorExtensions(doc),
      immediatelyRender: false,
    },
    [doc],
  );

  function openLinkForm() {
    if (!editor) return;
    linkSelectionRef.current = {
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    setLinkFormOpen(true);
  }

  useEffect(() => {
    editor?.setEditable(editable);
    if (!editable) setLinkFormOpen(false);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;

    const refreshBubbleMenu = () => {
      const { from, to } = editor.state.selection;
      if (!shouldShowPageEditorBubbleMenu(editor, from, to)) {
        setBubbleMenuPosition(undefined);
        return;
      }

      const coordinates = editor.view.coordsAtPos(to);
      setBubbleMenuPosition({
        left: coordinates.left,
        top: coordinates.top - 8,
      });
    };

    refreshBubbleMenu();
    editor.on('selectionUpdate', refreshBubbleMenu);
    editor.on('transaction', refreshBubbleMenu);

    return () => {
      editor.off('selectionUpdate', refreshBubbleMenu);
      editor.off('transaction', refreshBubbleMenu);
    };
  }, [editor]);

  return (
    <div className="w-full" data-page-editor-surface="">
      {editable && editor && <EditorToolbar editor={editor} />}
      {editable && editor && linkFormOpen && (
        <EditorFormDialog
          description="Вставьте адрес — ссылку без протокола мы автоматически откроем по HTTPS."
          editor={editor}
          onClose={() => setLinkFormOpen(false)}
          title="Добавить ссылку"
        >
          <LinkForm
            editor={editor}
            initialSelection={linkSelectionRef.current}
            onClose={() => setLinkFormOpen(false)}
          />
        </EditorFormDialog>
      )}
      {editable && editor && imageFormOpen && (
        <EditorFormDialog
          description="Добавьте безопасный HTTPS-адрес и описание изображения."
          editor={editor}
          onClose={() => setImageFormOpen(false)}
          title="Добавить изображение"
        >
          <ImageForm editor={editor} onClose={() => setImageFormOpen(false)} />
        </EditorFormDialog>
      )}
      {editable && editor && youtubeFormOpen && (
        <EditorFormDialog
          description="Поддерживаются обычные и короткие ссылки YouTube."
          editor={editor}
          onClose={() => setYoutubeFormOpen(false)}
          title="Добавить YouTube-видео"
        >
          <YoutubeForm editor={editor} onClose={() => setYoutubeFormOpen(false)} />
        </EditorFormDialog>
      )}
      {editable && editor && videoFormOpen && (
        <EditorFormDialog
          description="Добавьте прямой HTTPS-адрес файла MP4 или WebM."
          editor={editor}
          onClose={() => setVideoFormOpen(false)}
          title="Добавить видео"
        >
          <VideoForm editor={editor} onClose={() => setVideoFormOpen(false)} />
        </EditorFormDialog>
      )}
      {editable && editor && (
        <SlashMenu
          editor={editor}
          onLinkCommand={openLinkForm}
          onMediaCommand={(mediaType) => {
            setImageFormOpen(mediaType === 'image');
            setVideoFormOpen(mediaType === 'video');
            setYoutubeFormOpen(mediaType === 'youtube');
          }}
          onKeyDownChange={(handler) => {
            slashKeyDownHandlerRef.current = handler;
          }}
        />
      )}
      {editable && editor && <BlockReorderControls editor={editor} />}
      {editable && editor && bubbleMenuPosition && (
        <div className="fixed z-50 -translate-y-full" style={bubbleMenuPosition}>
          <BubbleFormattingMenu editor={editor} onOpenLinkForm={openLinkForm} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
