'use client';

import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { createPageDocumentVideoAttributes } from '@/entities/page-document';
import { Button, Input } from '@/shared/ui';

import { insertPageDocumentContent } from '../../model/insert-page-document-content';

export type VideoFormProps = Readonly<{ editor: Editor; onClose(): void }>;

export function VideoForm({ editor, onClose }: VideoFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function insertVideo() {
    const attrs = createPageDocumentVideoAttributes({ src });
    if (!attrs) {
      setError('Укажите HTTPS-адрес MP4 или WebM видео.');
      return;
    }
    insertPageDocumentContent(editor, { attrs, type: 'video' });
    onClose();
    requestAnimationFrame(() => !editor.isDestroyed && editor.commands.focus());
  }

  function closeAndFocusEditor() {
    onClose();
    requestAnimationFrame(() => !editor.isDestroyed && editor.commands.focus());
  }

  return (
    <form
      aria-label="Видео"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        insertVideo();
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium" htmlFor="page-editor-video-url">
        Адрес видео
      </label>
      <Input
        aria-describedby={error ? 'page-editor-video-error' : undefined}
        aria-invalid={Boolean(error)}
        id="page-editor-video-url"
        onChange={(event) => {
          setError(null);
          setSrc(event.target.value);
        }}
        placeholder="https://example.com/video.mp4"
        ref={inputRef}
        type="url"
        value={src}
      />
      {error && (
        <p className="text-sm text-destructive" id="page-editor-video-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={closeAndFocusEditor} type="button" variant="outline">
          Отмена
        </Button>
        <Button onClick={insertVideo} type="button">
          Вставить видео
        </Button>
      </div>
    </form>
  );
}
