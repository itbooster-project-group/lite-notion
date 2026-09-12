'use client';

import { Settings } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import type { PageDto } from '@/shared/api';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Select,
  Text,
} from '@/shared/ui';
import { usePageAccess } from '../model/use-page-access';

type PageAccessPanelProps = Readonly<{
  page: Pick<PageDto, 'accessMode' | 'id'>;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}>;

export function PageAccessPanel({ onOpenChange, open, page }: PageAccessPanelProps) {
  const access = usePageAccess(page.id);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [error, setError] = useState<string>();
  const [modeError, setModeError] = useState<string>();
  const [mode, setMode] = useState(page.accessMode);
  const [modeToConfirm, setModeToConfirm] = useState<typeof mode>();
  const [revokeError, setRevokeError] = useState<string>();
  const [revokeUserId, setRevokeUserId] = useState<string>();

  const isMutationPending =
    access.grantMutation.isPending ||
    access.revokeMutation.isPending ||
    access.accessModeMutation.isPending;

  useEffect(() => {
    setMode(page.accessMode);
  }, [page.accessMode]);

  async function submitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('Введите email пользователя.');
      return;
    }
    setError(undefined);
    try {
      await access.grant(normalizedEmail, role);
      setEmail('');
    } catch {
      setError('Не удалось изменить доступ. Попробуйте ещё раз.');
    }
  }

  async function confirmModeChange() {
    if (!modeToConfirm) return;
    setError(undefined);
    setModeError(undefined);
    try {
      const updated = await access.setAccessMode(modeToConfirm);
      setMode(updated.accessMode);
      setModeToConfirm(undefined);
    } catch {
      setModeError('Не удалось изменить режим доступа. Попробуйте ещё раз.');
    }
  }

  async function confirmRevoke() {
    if (!revokeUserId) return;
    setError(undefined);
    setRevokeError(undefined);
    try {
      await access.revoke(revokeUserId);
      setRevokeUserId(undefined);
    } catch {
      setRevokeError('Не удалось отозвать доступ. Попробуйте ещё раз.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined ? (
        <DialogTrigger
          render={
            <Button
              aria-label="Настроить доступ"
              className="shrink-0"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <Settings aria-hidden="true" />
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <section aria-labelledby="page-access-title" className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium" id="page-access-title">
              Доступ к странице
            </h2>
            <Text variant="caption">
              Прямые разрешения не показывают источник итогового доступа.
            </Text>
          </div>

          <div className="space-y-2">
            <Text as="span" variant="muted">
              Режим наследования
            </Text>
            <Select
              aria-label="Режим наследования"
              disabled={isMutationPending}
              options={[
                { label: 'Наследовать доступ', value: 'inherit' },
                { label: 'Ограничить наследование', value: 'restricted' },
              ]}
              value={mode}
              onValueChange={(next) => {
                if (next !== mode) {
                  setModeError(undefined);
                  setModeToConfirm(next as typeof mode);
                }
              }}
            />
          </div>

          <form className="space-y-2" onSubmit={(event) => void submitGrant(event)}>
            <Text as="span" variant="muted">
              Добавить пользователя
            </Text>
            <div className="flex flex-wrap gap-2">
              <Input
                aria-label="Email пользователя"
                className="min-w-0 flex-1 basis-full sm:basis-auto"
                disabled={isMutationPending}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                type="email"
                value={email}
              />
              <Select
                aria-label="Роль пользователя"
                disabled={isMutationPending}
                options={[
                  { label: 'Просмотр', value: 'viewer' },
                  { label: 'Редактор', value: 'editor' },
                ]}
                value={role}
                onValueChange={(next) => setRole(next as typeof role)}
              />
              <Button disabled={isMutationPending} type="submit">
                {access.grantMutation.isPending ? 'Сохраняем…' : 'Добавить'}
              </Button>
            </div>
          </form>

          {access.permissionsQuery.isPending ? (
            <Text aria-busy="true">Загружаем разрешения…</Text>
          ) : null}
          {access.permissionsQuery.isError ? (
            <div className="space-y-2">
              <Text role="alert" variant="error">
                Не удалось загрузить разрешения.
              </Text>
              <Button type="button" onClick={() => void access.permissionsQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : null}
          {access.permissionsQuery.data?.length === 0 ? (
            <Text variant="caption">Прямых разрешений пока нет.</Text>
          ) : null}
          {access.permissionsQuery.data?.length ? (
            <ul aria-label="Прямые разрешения" className="space-y-2">
              {access.permissionsQuery.data.map((grant) => (
                <li
                  className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                  key={grant.userId}
                >
                  <span className="min-w-0 truncate sm:col-start-1">
                    {grant.name} ({grant.email}) — {grant.role}
                  </span>
                  <Select
                    aria-label={`Роль для ${grant.email}`}
                    disabled={isMutationPending}
                    options={[
                      { label: 'Просмотр', value: 'viewer' },
                      { label: 'Редактор', value: 'editor' },
                    ]}
                    value={grant.role}
                    onValueChange={(next) => {
                      if (next === grant.role) return;
                      setError(undefined);
                      void access
                        .grant(grant.email, next as 'viewer' | 'editor')
                        .catch(() => setError('Не удалось изменить роль.'));
                    }}
                  />
                  <Button
                    disabled={isMutationPending}
                    onClick={() => {
                      setError(undefined);
                      setRevokeError(undefined);
                      setRevokeUserId(grant.userId);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Отозвать
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <Text role="alert" variant="error">
              {error}
            </Text>
          ) : null}
        </section>
      </DialogContent>

      <Dialog
        open={Boolean(revokeUserId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRevokeError(undefined);
            setRevokeUserId(undefined);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>Отозвать доступ?</DialogTitle>
          <DialogDescription>
            Пользователь больше не сможет пользоваться прямым разрешением этой страницы.
          </DialogDescription>
          {revokeError ? (
            <Text role="alert" variant="error">
              {revokeError}
            </Text>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button
                  disabled={access.revokeMutation.isPending}
                  type="button"
                  variant="outline"
                />
              }
            >
              Отмена
            </DialogClose>
            <Button
              disabled={access.revokeMutation.isPending}
              onClick={() => void confirmRevoke()}
              type="button"
              variant="destructive"
            >
              {access.revokeMutation.isPending ? 'Отзываем…' : 'Отозвать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(modeToConfirm)}
        onOpenChange={(open) => {
          if (!open) {
            setModeError(undefined);
            setModeToConfirm(undefined);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>Изменить режим доступа?</DialogTitle>
          <DialogDescription>
            Это может повлиять на доступ к странице и её поддереву. Конкретные роли пользователей не
            вычисляются в интерфейсе.
          </DialogDescription>
          {modeError ? (
            <Text role="alert" variant="error">
              {modeError}
            </Text>
          ) : null}
          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button
                  disabled={access.accessModeMutation.isPending}
                  type="button"
                  variant="outline"
                />
              }
            >
              Отмена
            </DialogClose>
            <Button
              disabled={access.accessModeMutation.isPending}
              onClick={() => void confirmModeChange()}
              type="button"
            >
              {access.accessModeMutation.isPending ? 'Сохраняем…' : 'Продолжить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
