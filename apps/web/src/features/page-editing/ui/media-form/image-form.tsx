'use client';

import type { Editor } from '@tiptap/core';
import { useEffect, useRef, useState } from 'react';
import { createPageDocumentImageAttributes } from '@/entities/page-document';
import { Button, Input } from '@/shared/ui';

import { insertPageDocumentContent } from '../../model/insert-page-document-content';

export type ImageFormProps = Readonly<{
  editor: Editor;
  onClose(): void;
}>;

export function ImageForm({ editor, onClose }: ImageFormProps) {
  const urlRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => urlRef.current?.focus(), []);

  function insertImage() {
    const attrs = createPageDocumentImageAttributes({ alt, decorative, src });
    if (!attrs) {
      setError('Укажите HTTPS-адрес и корректное текстовое описание изображения.');
      return;
    }
    insertPageDocumentContent(editor, { attrs, type: 'image' });
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }

  function closeAndFocusEditor() {
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }

  return (
    <form
      aria-label="Изображение"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        insertImage();
      }}
    >
      <label className="block space-y-1.5 text-sm font-medium" htmlFor="page-editor-image-url">
        Адрес изображения
      </label>
      <Input
        aria-describedby={error ? 'page-editor-image-error' : undefined}
        aria-invalid={Boolean(error)}
        id="page-editor-image-url"
        onChange={(event) => {
          setError(null);
          setSrc(event.target.value);
        }}
        placeholder="https://example.com/image.jpg"
        ref={urlRef}
        type="url"
        value={src}
      />
      <label className="block space-y-1.5 text-sm font-medium" htmlFor="page-editor-image-alt">
        Описание изображения
      </label>
      <Input
        disabled={decorative}
        id="page-editor-image-alt"
        onChange={(event) => {
          setError(null);
          setAlt(event.target.value);
        }}
        placeholder="Что изображено на картинке"
        value={alt}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={decorative}
          onChange={(event) => {
            setDecorative(event.target.checked);
            if (event.target.checked) setAlt('');
          }}
          type="checkbox"
        />
        Декоративное изображение
      </label>
      {error && (
        <p className="text-sm text-destructive" id="page-editor-image-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={closeAndFocusEditor} type="button" variant="outline">
          Отмена
        </Button>
        <Button onClick={insertImage} type="button">
          Вставить изображение
        </Button>
      </div>
    </form>
  );
}
