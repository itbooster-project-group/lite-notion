'use client';

import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { createPageDocumentYoutubeAttributes } from '@/entities/page-document';
import { Button, Input } from '@/shared/ui';

import { insertPageDocumentContent } from '../../model/insert-page-document-content';

export type YoutubeFormProps = Readonly<{ editor: Editor; onClose(): void }>;

export function YoutubeForm({ editor, onClose }: YoutubeFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function insertVideo() {
    const attrs = createPageDocumentYoutubeAttributes({ url });
    if (!attrs) {
      setError('Укажите корректную ссылку на YouTube.');
      return;
    }
    insertPageDocumentContent(editor, { attrs, type: 'youtube' });
    onClose();
    requestAnimationFrame(() => !editor.isDestroyed && editor.commands.focus());
  }

  function closeAndFocusEditor() {
    onClose();
    requestAnimationFrame(() => !editor.isDestroyed && editor.commands.focus());
  }

  return (
    <form
      aria-label="YouTube видео"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        insertVideo();
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium" htmlFor="page-editor-youtube-url">
        Ссылка на YouTube
      </label>
      <Input
        aria-describedby={error ? 'page-editor-youtube-error' : undefined}
        aria-invalid={Boolean(error)}
        id="page-editor-youtube-url"
        onChange={(event) => {
          setError(null);
          setUrl(event.target.value);
        }}
        placeholder="https://youtu.be/…"
        ref={inputRef}
        type="url"
        value={url}
      />
      {error && (
        <p className="text-sm text-destructive" id="page-editor-youtube-error" role="alert">
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
