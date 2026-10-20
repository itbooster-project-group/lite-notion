'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import type { PageCapabilities } from '@/entities/page';
import {
  getGetPagePublicationQueryKey,
  getPagePublication,
  type PublicationManagementDto,
  publishPage,
  republishPage,
  unpublishPage,
  updatePagePublicationMetadata,
  useGetPagePublication,
} from '@/shared/api';

export const publicationFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Введите адрес публикации.')
    .max(100, 'Адрес должен содержать не больше 100 символов.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Используйте латинские буквы, цифры и дефисы.'),
  seoTitle: z.string().max(255, 'Заголовок SEO должен содержать не больше 255 символов.'),
  seoDescription: z.string().max(1000, 'Описание SEO должно содержать не больше 1000 символов.'),
});

export type PublicationFormValues = z.infer<typeof publicationFormSchema>;
export type PublicationFeedback = Readonly<{
  kind: 'error' | 'success' | 'uncertain';
  message: string;
}>;

type Metadata = Readonly<{
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
}>;

export function usePublicationManagement({
  capabilities,
  onApply,
  pageId,
  setError,
}: Readonly<{
  capabilities: PageCapabilities;
  onApply: (publication: PublicationManagementDto, resetForm: boolean) => void;
  pageId: string;
  setError: UseFormSetError<PublicationFormValues>;
}>) {
  const queryClient = useQueryClient();
  const queryKey = getGetPagePublicationQueryKey(pageId);
  const publicationQuery = useGetPagePublication(pageId, {
    query: { enabled: capabilities.canManagePage, retry: false },
  });
  const [feedback, setFeedback] = useState<PublicationFeedback>();
  const [publicationOverride, setPublicationOverride] = useState<PublicationManagementDto>();
  const [republishBaseline, setRepublishBaseline] = useState<string | null | undefined>();
  const pendingRef = useRef(false);
  const [isOperationPending, setOperationPending] = useState(false);

  const publication = publicationOverride ?? publicationQuery.data;
  const isNeverPublished =
    publicationOverride === undefined && isPublicationNotFound(publicationQuery.error);
  const isQueryError =
    publicationOverride === undefined && publicationQuery.isError && !isNeverPublished;
  const isBusy = isOperationPending || publicationQuery.isPending || publicationQuery.isFetching;
  const isFirstPublish = !publication || publication.status === 'draft';

  function applyPublication(next: PublicationManagementDto, resetForm = true) {
    setPublicationOverride(next);
    queryClient.setQueryData(queryKey, next);
    onApply(next, resetForm);
  }

  async function reconcileStatus(): Promise<PublicationManagementDto | undefined> {
    try {
      const current = await getPagePublication(pageId);
      setPublicationOverride(current);
      queryClient.setQueryData(queryKey, current);
      return current;
    } catch {
      await queryClient.invalidateQueries({ queryKey });
      return undefined;
    }
  }

  async function runExclusive<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result | undefined> {
    if (pendingRef.current) return undefined;
    pendingRef.current = true;
    setOperationPending(true);
    setFeedback(undefined);
    try {
      return await operation();
    } finally {
      pendingRef.current = false;
      setOperationPending(false);
    }
  }

  async function publish(values: PublicationFormValues) {
    await runExclusive(async () => {
      const metadata = toMetadata(values);
      let draft: PublicationManagementDto;
      try {
        draft = await updatePagePublicationMetadata(pageId, metadata);
        applyPublication(draft);
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (current && metadataMatches(current, metadata) && current.status === 'draft') {
            applyPublication(current);
            setFeedback({
              kind: 'uncertain',
              message:
                'Настройки черновика сохранены. Нажмите «Опубликовать» ещё раз, чтобы продолжить.',
            });
          } else {
            setFeedback({
              kind: 'uncertain',
              message:
                'Не удалось подтвердить сохранение настроек. Обновите состояние публикации перед повтором.',
            });
          }
        } else {
          showMutationError(error, setError, setFeedback);
        }
        return;
      }

      try {
        const result = await publishPage(pageId, { slug: draft.slug });
        if (result.status === 'published' && result.slug === draft.slug) {
          applyPublication(result);
          setFeedback({ kind: 'success', message: 'Страница опубликована.' });
          return;
        }
        await reconcileStatus();
        setFeedback({
          kind: 'uncertain',
          message: 'Backend не подтвердил публикацию. Обновите состояние перед повтором.',
        });
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (current?.status === 'published' && current.slug === draft.slug) {
            applyPublication(current);
            setFeedback({
              kind: 'success',
              message: 'Публикация подтверждена по состоянию backend.',
            });
          } else {
            setFeedback({
              kind: 'uncertain',
              message:
                'Не удалось подтвердить результат публикации. Обновите состояние; команда автоматически не повторялась.',
            });
          }
        } else {
          showMutationError(error, setError, setFeedback);
        }
      }
    });
  }

  async function saveMetadata(values: PublicationFormValues) {
    await runExclusive(async () => {
      const metadata = toMetadata(values);
      try {
        const result = await updatePagePublicationMetadata(pageId, metadata);
        applyPublication(result);
        setFeedback({ kind: 'success', message: 'Настройки публикации сохранены.' });
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (current && metadataMatches(current, metadata)) {
            applyPublication(current);
            setFeedback({
              kind: 'success',
              message: 'Настройки подтверждены по состоянию backend.',
            });
          } else {
            setFeedback({
              kind: 'uncertain',
              message:
                'Не удалось подтвердить сохранение настроек. Введённые значения сохранены в форме.',
            });
          }
        } else {
          showMutationError(error, setError, setFeedback);
        }
      }
    });
  }

  async function republish() {
    await runExclusive(async () => {
      const before = publication;
      try {
        const result = await republishPage(pageId, {});
        if (result.status === 'published') {
          applyPublication(result);
          setRepublishBaseline(undefined);
          setFeedback({ kind: 'success', message: 'Новая опубликованная версия создана.' });
        } else {
          await reconcileStatus();
          setFeedback({
            kind: 'uncertain',
            message: 'Backend не подтвердил создание новой версии. Обновите состояние публикации.',
          });
        }
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (
            current?.status === 'published' &&
            before?.publishedAt !== null &&
            before?.publishedAt !== undefined &&
            current.publishedAt !== before.publishedAt
          ) {
            applyPublication(current);
            setRepublishBaseline(undefined);
            setFeedback({
              kind: 'success',
              message: 'Новая версия подтверждена по времени публикации.',
            });
          } else {
            setRepublishBaseline(before?.publishedAt ?? null);
            setFeedback({
              kind: 'uncertain',
              message:
                'Не удалось определить, создана ли новая версия. Повторный Republish не выполнялся; обновите состояние публикации.',
            });
          }
        } else {
          showMutationError(error, setError, setFeedback);
        }
      }
    });
  }

  async function unpublish() {
    return runExclusive(async () => {
      try {
        const result = await unpublishPage(pageId);
        if (result.status === 'unpublished') {
          applyPublication(result);
          setFeedback({ kind: 'success', message: 'Публикация снята.' });
          return true;
        }
        await reconcileStatus();
        setFeedback({ kind: 'uncertain', message: 'Не удалось подтвердить снятие публикации.' });
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (current?.status === 'unpublished') {
            applyPublication(current);
            setFeedback({
              kind: 'success',
              message: 'Снятие публикации подтверждено по состоянию backend.',
            });
            return true;
          }
          setFeedback({
            kind: 'uncertain',
            message:
              'Не удалось подтвердить результат. Обновите состояние; запрос не повторялся автоматически.',
          });
        } else {
          showMutationError(error, setError, setFeedback);
        }
      }
      return false;
    });
  }

  async function refreshUncertainStatus() {
    await runExclusive(async () => {
      const current = await reconcileStatus();
      if (
        republishBaseline !== undefined &&
        current?.status === 'published' &&
        republishBaseline !== null &&
        current.publishedAt !== republishBaseline
      ) {
        applyPublication(current);
        setRepublishBaseline(undefined);
        setFeedback({
          kind: 'success',
          message: 'Новая версия подтверждена по времени публикации.',
        });
        return;
      }
      setFeedback({
        kind: 'uncertain',
        message: current
          ? 'Состояние обновлено, но результат операции пока нельзя подтвердить.'
          : 'Не удалось загрузить состояние. Результат операции остаётся неопределённым.',
      });
    });
  }

  return {
    feedback,
    isBusy,
    isFirstPublish,
    isNeverPublished,
    isOperationPending,
    isQueryError,
    publication,
    publicationQuery,
    republishBaseline,
    publish,
    refreshUncertainStatus,
    republish,
    saveMetadata,
    setFeedback,
    unpublish,
  };
}

function isPublicationNotFound(error: unknown): boolean {
  return getStatus(error) === 404 && getResponseMessage(error) === 'publication_not_found';
}

function isUncertainResult(error: unknown): boolean {
  const status = getStatus(error);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}

function getResponseMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('info' in error)) return undefined;
  const info = error.info;
  return typeof info === 'object' &&
    info !== null &&
    'message' in info &&
    typeof info.message === 'string'
    ? info.message
    : undefined;
}

function showMutationError(
  error: unknown,
  setError: UseFormSetError<PublicationFormValues>,
  setFeedback: (feedback: PublicationFeedback) => void,
) {
  const status = getStatus(error);
  const message = getResponseMessage(error);
  if (status === 409 && message === 'publication_slug_conflict') {
    setError('slug', { message: 'Этот адрес уже занят. Выберите другой.' });
    setFeedback({ kind: 'error', message: 'Этот адрес уже занят.' });
  } else if (status === 403) {
    setFeedback({
      kind: 'error',
      message: 'Нет прав для управления публикацией. Обновите страницу.',
    });
  } else if (status === 409) {
    setFeedback({
      kind: 'error',
      message:
        'Backend отклонил операцию из-за текущего состояния публикации или недоступных assets.',
    });
  } else if (status !== undefined && status < 500) {
    setFeedback({
      kind: 'error',
      message: 'Backend отклонил операцию. Проверьте поля и повторите после исправления.',
    });
  } else {
    setFeedback({
      kind: 'uncertain',
      message: 'Не удалось подтвердить результат операции. Обновите состояние публикации.',
    });
  }
}

function toMetadata(values: PublicationFormValues): Metadata {
  return {
    slug: values.slug.trim().toLowerCase(),
    seoTitle: values.seoTitle.trim() || null,
    seoDescription: values.seoDescription.trim() || null,
  };
}

function metadataMatches(publication: PublicationManagementDto, metadata: Metadata): boolean {
  return (
    publication.slug === metadata.slug &&
    publication.seoTitle === metadata.seoTitle &&
    publication.seoDescription === metadata.seoDescription
  );
}
