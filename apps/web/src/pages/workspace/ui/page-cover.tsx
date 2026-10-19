'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, MoreHorizontal, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAssetReadUrl, useImageAssetUpload } from '@/entities/asset';
import { useSession } from '@/entities/session';
import type { PageDto } from '@/shared/api';
import {
  getGetPageQueryKey,
  getGetPageTreeQueryKey,
  getGetSharedPagesQueryKey,
  setPageCover,
} from '@/shared/api';
import { AssetImage, Button, Menu, MenuItem, MenuPopup, MenuTrigger } from '@/shared/ui';

type PageCoverProps = Readonly<{
  page: PageDto;
  placement: 'banner' | 'inline';
}>;

export function PageCover({ page, placement }: PageCoverProps) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const upload = useImageAssetUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pendingCoverAssetId, setPendingCoverAssetId] = useState<string>();
  const [saving, setSaving] = useState(false);
  const image = useAssetReadUrl(page.coverAssetId, user?.id, {
    id: page.id,
    kind: 'page',
  });
  const canEdit =
    !permissionDenied && (page.accessRole === 'owner' || page.accessRole === 'editor');
  const isBusy = upload.status === 'uploading' || saving;

  async function changeCover(assetId: string | null) {
    setError(undefined);
    setSaving(true);
    try {
      await setPageCover(page.id, { assetId });
      setPendingCoverAssetId(undefined);
    } catch (changeError) {
      const status = getStatus(changeError);
      setPermissionDenied(status === 401 || status === 403);
      setError(
        status === 403
          ? 'Нет права менять обложку. Текущая обложка сохранена.'
          : status === 401
            ? 'Сессия завершена. Войдите снова. Текущая обложка сохранена.'
            : 'Не удалось изменить обложку. Текущая обложка сохранена.',
      );
    } finally {
      setSaving(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPageQueryKey(page.id) }),
        queryClient.invalidateQueries({ queryKey: getGetPageTreeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetSharedPagesQueryKey() }),
      ]);
    }
  }

  async function uploadCover(file: File) {
    setError(undefined);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Поддерживаются JPEG, PNG и WebP.');
      return;
    }
    const assetId = await upload.upload(file, page.id);
    if (assetId) {
      setPendingCoverAssetId(assetId);
      await changeCover(assetId);
    }
  }

  const coverImage = page.coverAssetId ? (
    <div className="group relative isolate overflow-hidden rounded-xl bg-muted">
      <AssetImage
        alt="Обложка страницы"
        className="h-auto w-full aspect-[2/1] object-cover sm:aspect-[3.8/1] md:aspect-[4.7/1]"
        fallback={
          <div
            className="w-full aspect-[2/1] bg-muted sm:aspect-[3.8/1] md:aspect-[4.7/1]"
            aria-label="Обложка недоступна"
            role="img"
          />
        }
        height={256}
        onImageError={image.onImageError}
        src={image.src}
        state={image.state}
        width={1200}
      />
      {canEdit ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/45 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <Menu>
            <MenuTrigger
              aria-label="Изменить обложку"
              disabled={isBusy}
              render={
                <Button
                  className="gap-2 bg-background/95 shadow-sm hover:bg-background"
                  type="button"
                  variant="secondary"
                />
              }
            >
              <ImagePlus aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Изменить обложку</span>
              <MoreHorizontal aria-hidden="true" className="size-4 sm:hidden" />
            </MenuTrigger>
            <MenuPopup align="end" side="top">
              <MenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload aria-hidden="true" />
                Загрузить изображение
              </MenuItem>
              <MenuItem onClick={() => void changeCover(null)} variant="destructive">
                <Trash2 aria-hidden="true" />
                Удалить обложку
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      ) : null}
      {isBusy ? (
        <div
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm font-medium backdrop-blur-[1px]"
        >
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          <span>
            {upload.status === 'uploading' ? `Загрузка… ${upload.progress}%` : 'Сохраняем обложку…'}
          </span>
          {upload.status === 'uploading' ? (
            <progress
              aria-label="Загрузка обложки"
              className="h-1 w-40 accent-primary"
              max={100}
              value={upload.progress}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  if (placement === 'banner') {
    return (
      <section aria-label="Обложка страницы" className="space-y-2">
        {coverImage}
        {canEdit ? (
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Загрузить изображение обложки"
            className="sr-only"
            disabled={isBusy || !upload.canStartNew}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void uploadCover(file);
            }}
            ref={fileInputRef}
            type="file"
          />
        ) : null}
        {upload.error || error ? <CoverError message={error ?? upload.error ?? ''} /> : null}
        {pendingCoverAssetId && upload.status !== 'uploading' && canEdit ? (
          <Button
            onClick={() => void changeCover(pendingCoverAssetId)}
            type="button"
            variant="outline"
          >
            Повторить сохранение обложки
          </Button>
        ) : null}
        {upload.status === 'failed' && upload.canRetry && canEdit ? (
          <Button
            onClick={() =>
              void upload.retry().then(async (assetId) => {
                if (assetId) {
                  setPendingCoverAssetId(assetId);
                  await changeCover(assetId);
                }
              })
            }
            type="button"
            variant="outline"
          >
            Повторить загрузку обложки
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!page.coverAssetId && canEdit ? (
        <>
          <Button
            className="text-muted-foreground"
            disabled={isBusy || !upload.canStartNew}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ImagePlus aria-hidden="true" />
            Добавить обложку
          </Button>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Загрузить изображение обложки"
            className="sr-only"
            disabled={isBusy || !upload.canStartNew}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void uploadCover(file);
            }}
            ref={fileInputRef}
            type="file"
          />
        </>
      ) : null}
      {upload.status === 'uploading' ? (
        <span aria-live="polite" className="text-xs text-muted-foreground">
          Загружаем обложку… {upload.progress}%
        </span>
      ) : null}
      {upload.error || error ? <CoverError message={error ?? upload.error ?? ''} /> : null}
      {pendingCoverAssetId && upload.status !== 'uploading' && canEdit ? (
        <Button
          onClick={() => void changeCover(pendingCoverAssetId)}
          size="sm"
          type="button"
          variant="outline"
        >
          Повторить сохранение обложки
        </Button>
      ) : null}
      {upload.status === 'failed' && upload.canRetry && canEdit ? (
        <Button
          onClick={() =>
            void upload.retry().then(async (assetId) => {
              if (assetId) {
                setPendingCoverAssetId(assetId);
                await changeCover(assetId);
              }
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

function CoverError({ message }: Readonly<{ message: string }>) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}
