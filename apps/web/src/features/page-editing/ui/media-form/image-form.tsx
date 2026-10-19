'use client';

import type { Editor } from '@tiptap/core';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useImageAssetUpload } from '@/entities/asset';
import {
  createPageDocumentAssetImageAttributes,
  createPageDocumentImageAttributes,
} from '@/entities/page-document';
import { Button, Checkbox, Input } from '@/shared/ui';

import { insertPageDocumentContent } from '../../model/insert-page-document-content';

export type ImageFormProps = Readonly<{
  editor: Editor;
  pageId?: string | undefined;
  onClose(): void;
}>;

type InsertMethod = 'upload' | 'url';

export function ImageForm({ editor, onClose, pageId }: ImageFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertionStarted = useRef(false);
  const [method, setMethod] = useState<InsertMethod>('upload');
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const assetUpload = useImageAssetUpload();
  const descriptionIsValid = decorative ? alt.trim().length === 0 : alt.trim().length > 0;
  const urlIsValid = Boolean(createPageDocumentImageAttributes({ alt, decorative, src }));
  const uploadIsBusy = assetUpload.status === 'uploading';
  const canUpload = Boolean(file && descriptionIsValid && assetUpload.canStartNew);
  const canRetry = Boolean(assetUpload.status === 'failed' && assetUpload.canRetry);
  const submitDisabled =
    uploadIsBusy ||
    !descriptionIsValid ||
    (method === 'url' ? !urlIsValid : !canUpload && !canRetry);

  useEffect(() => {
    document.getElementById('image-upload-tab')?.focus();
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function insertImage() {
    if (insertionStarted.current) return;
    const attrs = createPageDocumentImageAttributes({ alt, decorative, src });
    if (!attrs) {
      setError('Укажите безопасный HTTPS-адрес и корректное описание изображения.');
      return;
    }
    insertionStarted.current = true;
    insertPageDocumentContent(editor, { attrs, type: 'image' });
    closeAndFocusEditor();
  }

  function insertUploadedAsset(assetId: string) {
    if (insertionStarted.current) return;
    const attrs = createPageDocumentAssetImageAttributes({ assetId, alt, decorative });
    if (!attrs) {
      setError(
        decorative
          ? 'Для декоративного изображения описание должно быть пустым.'
          : 'Укажите описание изображения или выберите декоративный вариант.',
      );
      return;
    }
    insertionStarted.current = true;
    insertPageDocumentContent(editor, { attrs, type: 'image' });
    closeAndFocusEditor();
  }

  async function submitUpload() {
    if (!file || insertionStarted.current) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Поддерживаются JPEG, PNG и WebP.');
      return;
    }
    if (!descriptionIsValid) {
      setError(
        decorative
          ? 'Для декоративного изображения описание должно быть пустым.'
          : 'Укажите описание изображения или выберите декоративный вариант.',
      );
      return;
    }
    setError(null);
    const assetId = canRetry ? await assetUpload.retry() : await assetUpload.upload(file, pageId);
    if (assetId) insertUploadedAsset(assetId);
  }

  function closeAndFocusEditor() {
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }

  function chooseFile(nextFile: File | undefined) {
    setError(null);
    if (nextFile && assetUpload.selectNewFile()) setFile(nextFile);
  }

  return (
    <form
      aria-label="Изображение"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (method === 'url') insertImage();
        else void submitUpload();
      }}
    >
      <div
        aria-label="Способ добавления изображения"
        className="grid grid-cols-2 rounded-lg bg-muted p-1"
        role="tablist"
      >
        <button
          aria-controls="image-upload-panel"
          aria-selected={method === 'upload'}
          className="min-h-9 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm"
          id="image-upload-tab"
          onClick={() => setMethod('upload')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              const next = method === 'upload' ? 'url' : 'upload';
              setMethod(next);
              document.getElementById(`image-${next}-tab`)?.focus();
            }
          }}
          role="tab"
          tabIndex={method === 'upload' ? 0 : -1}
          type="button"
        >
          Загрузить файл
        </button>
        <button
          aria-controls="image-url-panel"
          aria-selected={method === 'url'}
          className="min-h-9 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm"
          id="image-url-tab"
          onClick={() => setMethod('url')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              const next = method === 'upload' ? 'url' : 'upload';
              setMethod(next);
              document.getElementById(`image-${next}-tab`)?.focus();
            }
          }}
          role="tab"
          tabIndex={method === 'url' ? 0 : -1}
          type="button"
        >
          По ссылке
        </button>
      </div>

      <div className="contents">
        <section
          aria-label="Загрузка файла"
          aria-labelledby="image-upload-tab"
          className="space-y-3"
          hidden={method !== 'upload'}
          id="image-upload-panel"
          role="tabpanel"
        >
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Выбрать файл изображения"
            className="peer sr-only"
            disabled={!assetUpload.canSelectNewFile}
            onChange={(event) => {
              const selectedFile = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              chooseFile(selectedFile);
            }}
            ref={fileInputRef}
            type="file"
          />
          {file && previewUrl ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
                {/* Local blob preview is intentionally rendered directly; Next/Image cannot optimize blob URLs. */}
                {/* biome-ignore lint/performance/noImgElement: Preview uses a temporary local object URL. */}
                <img
                  alt=""
                  className="mx-auto max-h-48 w-full rounded-md object-contain"
                  src={previewUrl}
                />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button
                  disabled={!assetUpload.canSelectNewFile}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  <Upload aria-hidden="true" />
                  Заменить файл
                </Button>
              </div>
            </div>
          ) : (
            <fieldset
              className="group m-0 flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-5 py-6 text-center transition-colors hover:border-ring/50 hover:bg-muted/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files?.[0]);
              }}
            >
              <legend className="sr-only">Область загрузки изображения</legend>
              <ImageIcon aria-hidden="true" className="size-7 text-muted-foreground" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Перетащите изображение сюда</p>
                <p className="text-xs text-muted-foreground">или выберите файл с компьютера</p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
                Выбрать файл
              </Button>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">
            Поддерживаются JPEG, PNG и WebP. Максимальный размер задаётся сервером.
          </p>
          {uploadIsBusy ? (
            <div aria-live="polite" className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Загружаем изображение…</span>
                <span>{assetUpload.progress}%</span>
              </div>
              <progress
                aria-label="Загрузка изображения"
                className="h-1.5 w-full accent-primary"
                max={100}
                value={assetUpload.progress}
              />
            </div>
          ) : null}
          {assetUpload.error ? (
            <p className="text-sm text-destructive" role="alert">
              {assetUpload.error}
            </p>
          ) : null}
        </section>
        <section
          aria-labelledby="image-url-tab"
          className="space-y-1.5"
          hidden={method !== 'url'}
          id="image-url-panel"
          role="tabpanel"
        >
          <label className="text-sm font-medium" htmlFor="page-editor-image-url">
            Ссылка на изображение
          </label>
          <Input
            aria-invalid={Boolean(error)}
            id="page-editor-image-url"
            onChange={(event) => {
              setError(null);
              setSrc(event.target.value);
            }}
            placeholder="https://example.com/image.jpg"
            type="url"
            value={src}
          />
        </section>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="page-editor-image-alt">
          Описание изображения
        </label>
        <Input
          aria-describedby="page-editor-image-alt-help"
          aria-invalid={!decorative && Boolean(error)}
          disabled={decorative}
          id="page-editor-image-alt"
          onChange={(event) => {
            setError(null);
            setAlt(event.target.value);
          }}
          placeholder="Например, горный пейзаж на закате"
          value={alt}
        />
        <p className="text-xs text-muted-foreground" id="page-editor-image-alt-help">
          {decorative
            ? 'Для декоративного изображения описание не требуется.'
            : 'Помогает людям, использующим программы чтения с экрана.'}
        </p>
      </div>
      <div className="flex w-fit items-center gap-2 text-sm">
        <Checkbox
          aria-label="Декоративное изображение"
          checked={decorative}
          onCheckedChange={(checked) => {
            setDecorative(checked);
            if (checked) setAlt('');
            setError(null);
          }}
        />
        <span>Декоративное изображение</span>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button onClick={closeAndFocusEditor} type="button" variant="outline">
          Отмена
        </Button>
        <Button disabled={submitDisabled} loading={uploadIsBusy} type="submit">
          {method === 'url'
            ? 'Вставить изображение'
            : canRetry
              ? 'Повторить загрузку'
              : 'Вставить изображение'}
        </Button>
      </div>
    </form>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}
