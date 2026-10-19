'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle, MoreHorizontal, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAssetReadUrl, useImageAssetUpload } from '@/entities/asset';
import { useSession } from '@/entities/session';
import { getGetCurrentUserQueryKey, setCurrentUserAvatar } from '@/shared/api';
import {
  AssetImage,
  Button,
  ContentContainer,
  Heading,
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  Text,
} from '@/shared/ui';

export function ProfilePage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const upload = useImageAssetUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pendingAvatarAssetId, setPendingAvatarAssetId] = useState<string>();
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatar = useAssetReadUrl(user?.avatarAssetId, user?.id, {
    id: user?.id ?? '',
    kind: 'avatar',
  });
  const isBusy = upload.status === 'uploading' || savingAvatar;
  const canChooseAvatar = !permissionDenied && upload.canSelectNewFile && !savingAvatar;

  if (user === undefined) {
    return (
      <ContentContainer>
        <Text variant="caption">Загружаем профиль…</Text>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <section className="space-y-6" aria-labelledby="profile-title">
        <Heading as="h1" variant="page" id="profile-title">
          Профиль
        </Heading>
        <div className="flex flex-col gap-5 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-full bg-muted">
            <AssetImage
              alt={`${user.name}: аватар`}
              className="size-24 rounded-full object-cover"
              fallback={
                <div
                  aria-label="Нет аватара"
                  className="flex size-24 items-center justify-center rounded-full bg-muted text-2xl font-medium text-muted-foreground"
                  role="img"
                >
                  {getInitial(user.name)}
                </div>
              }
              height={96}
              onImageError={avatar.onImageError}
              onImageLoad={avatar.onImageLoad}
              src={avatar.src}
              state={user.avatarAssetId ? avatar.state : 'unavailable'}
              width={96}
            />
            {isBusy ? (
              <div
                aria-label={savingAvatar ? 'Сохраняем аватар' : 'Загрузка аватара'}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={savingAvatar ? 100 : upload.progress}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/75 px-3 text-xs"
                role="progressbar"
              >
                <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                <span>{savingAvatar ? 'Сохраняем…' : `${upload.progress}%`}</span>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Аватар</p>
              <p className="text-sm text-muted-foreground">
                JPG, PNG или WebP. Загрузите изображение профиля.
              </p>
            </div>

            <input
              accept="image/jpeg,image/png,image/webp"
              aria-label="Выбрать изображение аватара"
              className="sr-only"
              disabled={!canChooseAvatar}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file && upload.selectNewFile()) {
                  setPermissionDenied(false);
                  void saveAvatar(file);
                }
              }}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />

            {user.avatarAssetId ? (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      aria-label="Действия с аватаром"
                      disabled={isBusy || !canChooseAvatar}
                      type="button"
                      variant="outline"
                    />
                  }
                >
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                  Изменить
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuItem
                    disabled={!canChooseAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Заменить аватар
                  </MenuItem>
                  <MenuItem
                    disabled={isBusy || permissionDenied}
                    onClick={() => void updateAvatar(null)}
                    variant="destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    Удалить аватар
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : (
              <Button
                disabled={!canChooseAvatar}
                onClick={() => fileInputRef.current?.click()}
                type="button"
                variant="outline"
              >
                <ImagePlus aria-hidden="true" className="size-4" />
                Загрузить аватар
              </Button>
            )}

            {upload.status === 'failed' && upload.canRetry ? (
              <Button
                disabled={savingAvatar}
                onClick={() =>
                  void upload.retry().then(async (id) => {
                    if (id) {
                      setPendingAvatarAssetId(id);
                      await updateAvatar(id);
                    }
                  })
                }
                type="button"
              >
                Повторить загрузку
              </Button>
            ) : null}
            {pendingAvatarAssetId && upload.status !== 'uploading' && !permissionDenied ? (
              <Button
                disabled={savingAvatar}
                onClick={() => void updateAvatar(pendingAvatarAssetId)}
                type="button"
                variant="outline"
              >
                Повторить сохранение аватара
              </Button>
            ) : null}
            {upload.error || error ? (
              <p className="max-w-xl break-words text-sm text-destructive" role="alert">
                {error ?? upload.error}
              </p>
            ) : null}
          </div>
        </div>
        <dl className="space-y-4">
          <ProfileField label="Имя" value={user.name} />
          <ProfileField label="Email" value={user.email} />
          <ProfileField label="Дата регистрации" value={formatDate(user.createdAt)} />
        </dl>
      </section>
    </ContentContainer>
  );

  async function saveAvatar(file: File) {
    setError(undefined);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Поддерживаются JPEG, PNG и WebP.');
      return;
    }
    const assetId = await upload.upload(file);
    if (assetId) {
      setPendingAvatarAssetId(assetId);
      await updateAvatar(assetId);
    }
  }

  async function updateAvatar(assetId: string | null) {
    setSavingAvatar(true);
    try {
      await setCurrentUserAvatar({ assetId });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), { ...user, avatarAssetId: assetId });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      setPendingAvatarAssetId(undefined);
      setError(undefined);
    } catch (updateError) {
      const status = getStatus(updateError);
      setPermissionDenied(status === 401 || status === 403);
      setError(
        status === 403
          ? 'Нет права менять аватар. Текущий аватар сохранён.'
          : status === 401
            ? 'Сессия завершена. Войдите снова. Текущий аватар сохранён.'
            : 'Не удалось изменить аватар. Текущий аватар сохранён.',
      );
    } finally {
      setSavingAvatar(false);
    }
  }
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

type ProfileFieldProps = Readonly<{
  label: string;
  value: string;
}>;

function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(value));
}
