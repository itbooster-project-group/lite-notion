'use client';

import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { createPageDocumentEditorExtensions } from '@/entities/page-document';
import { cn } from '@/shared/lib/cn';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui';

import { shouldShowPageEditorBubbleMenu } from '../../model/bubble-menu';
import {
  createPageDocumentRelativeSelection,
  type PageDocumentRelativeSelection,
} from '../../model/page-document-relative-selection';
import { BlockReorderControls } from '../block-reorder-controls';
import { BubbleFormattingMenu } from '../bubble-menu';
import { useEditorPopupPosition } from '../editor-popup-position/use-editor-popup-position';
import { EditorToolbar } from '../editor-toolbar';
import { LinkForm } from '../link-form';
import { ImageForm, VideoForm, YoutubeForm } from '../media-form';
import { SlashMenu } from '../slash-menu';
import styles from './page-editor-surface.module.css';

export type PageEditorSurfaceProps = Readonly<{
  doc: Y.Doc;
  editable: boolean;
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
  const [transientIdentity, setTransientIdentity] = useState<{
    doc: Y.Doc;
    editor: Editor | null;
  }>({ doc, editor: null });
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [imageFormOpen, setImageFormOpen] = useState(false);
  const [videoFormOpen, setVideoFormOpen] = useState(false);
  const [youtubeFormOpen, setYoutubeFormOpen] = useState(false);
  const linkSelectionRef = useRef<PageDocumentRelativeSelection | undefined>(undefined);
  const slashKeyDownHandlerRef = useRef<((event: KeyboardEvent) => boolean) | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const editor = useEditor(
    {
      editable,
      editorProps: {
        attributes: {
          'aria-label': 'Содержимое страницы',
          class: cn(
            styles.editorContent,
            'min-h-64 w-full max-w-none px-1 py-4 text-sm leading-6 outline-none',
          ),
          'data-page-editor-content': '',
          role: 'textbox',
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && editable) {
            event.preventDefault();
            linkSelectionRef.current = editorRef.current
              ? createPageDocumentRelativeSelection(editorRef.current)
              : undefined;
            if (!linkSelectionRef.current) return true;
            setLinkFormOpen(true);
            return true;
          }

          return slashKeyDownHandlerRef.current?.(event) ?? false;
        },
      },
      extensions: createPageDocumentEditorExtensions(doc),
      immediatelyRender: false,
      onCreate: ({ editor: createdEditor }) => {
        setTransientIdentity({ doc, editor: createdEditor });
      },
    },
    [doc],
  );
  editorRef.current = editor;
  const documentUiIsCurrent = transientIdentity.doc === doc && transientIdentity.editor === editor;

  const getBubbleMenuAnchor = useCallback(() => {
    if (!editor) return undefined;
    const { from, to } = editor.state.selection;
    if (!shouldShowPageEditorBubbleMenu(editor, from, to)) return undefined;
    return editor.view.coordsAtPos(to);
  }, [editor]);
  const bubbleMenuPopup = useEditorPopupPosition({
    editor,
    getAnchor: getBubbleMenuAnchor,
    placement: 'above',
  });

  function openLinkForm() {
    if (!editor) return;
    linkSelectionRef.current = createPageDocumentRelativeSelection(editor);
    if (!linkSelectionRef.current) return;
    setLinkFormOpen(true);
  }

  function closeLinkForm() {
    linkSelectionRef.current = undefined;
    setLinkFormOpen(false);
  }

  useEffect(() => {
    const resetDocumentTransientUi = () => {
      setLinkFormOpen(false);
      setImageFormOpen(false);
      setVideoFormOpen(false);
      setYoutubeFormOpen(false);
      linkSelectionRef.current = undefined;
      slashKeyDownHandlerRef.current = undefined;
    };

    resetDocumentTransientUi();
    doc.on('destroy', resetDocumentTransientUi);
    editor?.on('destroy', resetDocumentTransientUi);

    return () => {
      doc.off('destroy', resetDocumentTransientUi);
      editor?.off('destroy', resetDocumentTransientUi);
    };
  }, [doc, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
    if (!editable) {
      setLinkFormOpen(false);
      setImageFormOpen(false);
      setVideoFormOpen(false);
      setYoutubeFormOpen(false);
      linkSelectionRef.current = undefined;
      slashKeyDownHandlerRef.current = undefined;
    }
  }, [editable, editor]);

  return (
    <div className="w-full" data-page-editor-surface="">
      {documentUiIsCurrent && editor ? (
        <>
          {editable && <EditorToolbar editor={editor} />}
          {editable && linkFormOpen && (
            <EditorFormDialog
              description="Вставьте адрес — ссылку без протокола мы автоматически откроем по HTTPS."
              editor={editor}
              onClose={closeLinkForm}
              title="Добавить ссылку"
            >
              <LinkForm
                editor={editor}
                initialSelection={linkSelectionRef.current}
                onClose={closeLinkForm}
              />
            </EditorFormDialog>
          )}
          {editable && imageFormOpen && (
            <EditorFormDialog
              description="Добавьте безопасный HTTPS-адрес и описание изображения."
              editor={editor}
              onClose={() => setImageFormOpen(false)}
              title="Добавить изображение"
            >
              <ImageForm editor={editor} onClose={() => setImageFormOpen(false)} />
            </EditorFormDialog>
          )}
          {editable && youtubeFormOpen && (
            <EditorFormDialog
              description="Поддерживаются обычные и короткие ссылки YouTube."
              editor={editor}
              onClose={() => setYoutubeFormOpen(false)}
              title="Добавить YouTube-видео"
            >
              <YoutubeForm editor={editor} onClose={() => setYoutubeFormOpen(false)} />
            </EditorFormDialog>
          )}
          {editable && videoFormOpen && (
            <EditorFormDialog
              description="Добавьте прямой HTTPS-адрес файла MP4 или WebM."
              editor={editor}
              onClose={() => setVideoFormOpen(false)}
              title="Добавить видео"
            >
              <VideoForm editor={editor} onClose={() => setVideoFormOpen(false)} />
            </EditorFormDialog>
          )}
          {editable && (
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
          {editable && <BlockReorderControls editor={editor} />}
          {editable && bubbleMenuPopup.position && (
            <div
              className="fixed z-50"
              ref={bubbleMenuPopup.floatingRef}
              style={bubbleMenuPopup.position}
            >
              <BubbleFormattingMenu editor={editor} onOpenLinkForm={openLinkForm} />
            </div>
          )}
          <EditorContent editor={editor} />
        </>
      ) : (
        <div
          aria-busy="true"
          aria-live="polite"
          className="min-h-64 px-1 py-4 text-sm text-muted-foreground"
          data-page-editor-transition=""
        >
          Подготавливаем документ…
        </div>
      )}
    </div>
  );
}
