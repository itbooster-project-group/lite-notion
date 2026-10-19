'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAssetReadUrl, useImageAssetUpload } from '@/entities/asset';
import { useSession } from '@/entities/session';
import { getGetCurrentUserQueryKey, setCurrentUserAvatar } from '@/shared/api';
import { AssetImage, Button, ContentContainer, Heading, Input, Text } from '@/shared/ui';

export function ProfilePage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const upload = useImageAssetUpload();
  const [error, setError] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pendingAvatarAssetId, setPendingAvatarAssetId] = useState<string>();
  const avatar = useAssetReadUrl(user?.avatarAssetId, user?.id, {
    id: user?.id ?? '',
    kind: 'avatar',
  });

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
        <div className="flex items-center gap-4">
          <AssetImage
            alt={`${user.name}: аватар`}
            className="size-20 rounded-full object-cover"
            fallback={
              <div
                aria-label="Нет аватара"
                className="flex size-20 items-center justify-center rounded-full bg-muted text-xl"
                role="img"
              >
                {getInitial(user.name)}
              </div>
            }
            height={80}
            onImageError={avatar.onImageError}
            onImageLoad={avatar.onImageLoad}
            src={avatar.src}
            state={user.avatarAssetId ? avatar.state : 'unavailable'}
            width={80}
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="profile-avatar-file">
              Аватар
            </label>
            <Input
              accept="image/jpeg,image/png,image/webp"
              disabled={permissionDenied || !upload.canSelectNewFile}
              id="profile-avatar-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  event.currentTarget.value = '';
                  setPermissionDenied(false);
                  upload.selectNewFile();
                  void saveAvatar(file);
                }
              }}
              type="file"
            />
            {user.avatarAssetId ? (
              <Button
                disabled={upload.status === 'uploading'}
                onClick={() => void updateAvatar(null)}
                type="button"
                variant="outline"
              >
                Удалить аватар
              </Button>
            ) : null}
            {upload.status === 'uploading' ? (
              <progress aria-label="Загрузка аватара" max={100} value={upload.progress} />
            ) : null}
            {upload.status === 'failed' && upload.canRetry ? (
              <Button
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
                onClick={() => void updateAvatar(pendingAvatarAssetId)}
                type="button"
                variant="outline"
              >
                Повторить сохранение аватара
              </Button>
            ) : null}
            {upload.error || error ? (
              <p role="alert" className="text-sm text-destructive">
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
