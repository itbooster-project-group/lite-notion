'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Text,
  Textarea,
} from '@/shared/ui';

const publicationFormSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Введите адрес публикации.')
    .max(100, 'Адрес должен содержать не больше 100 символов.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Используйте латинские буквы, цифры и дефисы.'),
  seoTitle: z.string().max(255, 'Заголовок SEO должен содержать не больше 255 символов.'),
  seoDescription: z.string().max(1000, 'Описание SEO должно содержать не больше 1000 символов.'),
});

type PublicationFormValues = z.infer<typeof publicationFormSchema>;
type Feedback = Readonly<{ kind: 'error' | 'success' | 'uncertain'; message: string }>;

type PublicationManagementProps = Readonly<{
  pageId: string;
  capabilities: PageCapabilities;
}>;

export function PublicationManagement({ capabilities, pageId }: PublicationManagementProps) {
  const queryClient = useQueryClient();
  const queryKey = getGetPagePublicationQueryKey(pageId);
  const publicationQuery = useGetPagePublication(pageId, {
    query: { enabled: capabilities.canManagePage, retry: false },
  });
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isUnpublishOpen, setUnpublishOpen] = useState(false);
  const [isOperationPending, setOperationPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [publicationOverride, setPublicationOverride] = useState<PublicationManagementDto>();
  const [republishBaseline, setRepublishBaseline] = useState<string | null | undefined>();
  const pendingRef = useRef(false);
  const form = useForm<PublicationFormValues>({
    defaultValues: { slug: '', seoTitle: '', seoDescription: '' },
    resolver: zodResolver(publicationFormSchema),
  });

  const publication = publicationOverride ?? publicationQuery.data;
  const isNeverPublished =
    publicationOverride === undefined && isPublicationNotFound(publicationQuery.error);
  const isQueryError =
    publicationOverride === undefined && publicationQuery.isError && !isNeverPublished;
  const isBusy = isOperationPending || publicationQuery.isPending || publicationQuery.isFetching;
  const isFirstPublish = !publication || publication.status === 'draft';
  const publicUrl = getPublicUrl(publication);

  useEffect(() => {
    if (publication && !form.formState.isDirty) {
      form.reset(toFormValues(publication));
    }
  }, [form, publication]);

  if (!capabilities.canManagePage) return null;

  function applyPublication(next: PublicationManagementDto, resetForm = true) {
    setPublicationOverride(next);
    queryClient.setQueryData(queryKey, next);
    if (resetForm) form.reset(toFormValues(next));
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

  async function runExclusive(operation: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setOperationPending(true);
    setFeedback(undefined);
    try {
      await operation();
    } finally {
      pendingRef.current = false;
      setOperationPending(false);
    }
  }

  async function handleFirstPublish(values: PublicationFormValues) {
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
          showMutationError(error, form.setError, setFeedback);
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
          showMutationError(error, form.setError, setFeedback);
        }
      }
    });
  }

  async function handleMetadataSave(values: PublicationFormValues) {
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
          showMutationError(error, form.setError, setFeedback);
        }
      }
    });
  }

  async function handleRepublish() {
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
          showMutationError(error, form.setError, setFeedback);
        }
      }
    });
  }

  async function handleUnpublish() {
    await runExclusive(async () => {
      try {
        const result = await unpublishPage(pageId);
        if (result.status === 'unpublished') {
          applyPublication(result);
          setFeedback({ kind: 'success', message: 'Публикация снята.' });
          setUnpublishOpen(false);
        } else {
          await reconcileStatus();
          setFeedback({ kind: 'uncertain', message: 'Не удалось подтвердить снятие публикации.' });
        }
      } catch (error) {
        if (isUncertainResult(error)) {
          const current = await reconcileStatus();
          if (current?.status === 'unpublished') {
            applyPublication(current);
            setFeedback({
              kind: 'success',
              message: 'Снятие публикации подтверждено по состоянию backend.',
            });
            setUnpublishOpen(false);
          } else {
            setFeedback({
              kind: 'uncertain',
              message:
                'Не удалось подтвердить результат. Обновите состояние; запрос не повторялся автоматически.',
            });
          }
        } else {
          showMutationError(error, form.setError, setFeedback);
        }
      }
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

  function copyPublicUrl() {
    if (!publicUrl) return;
    void navigator.clipboard
      .writeText(publicUrl)
      .then(() => setFeedback({ kind: 'success', message: 'Публичная ссылка скопирована.' }))
      .catch(() => setFeedback({ kind: 'error', message: 'Не удалось скопировать ссылку.' }));
  }

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              <Globe aria-hidden="true" />
              Публикация
            </Button>
          }
        />
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Публикация страницы</DialogTitle>
            <DialogDescription>
              Публичная версия обновляется только после явной публикации.
            </DialogDescription>
          </DialogHeader>

          {publicationQuery.isPending ? (
            <Text aria-busy="true" role="status">
              Загружаем состояние публикации…
            </Text>
          ) : null}
          {isQueryError ? (
            <div className="space-y-3">
              <Text role="alert" variant="error">
                Не удалось загрузить состояние публикации.
              </Text>
              <Button
                disabled={isBusy}
                onClick={() => void publicationQuery.refetch()}
                type="button"
                variant="outline"
              >
                <RefreshCw aria-hidden="true" />
                Обновить состояние
              </Button>
            </div>
          ) : null}

          {!publicationQuery.isPending && !isQueryError ? (
            <div className="space-y-4">
              <StatusSummary
                publication={publication}
                isNeverPublished={isNeverPublished}
                publicUrl={publicUrl}
                onCopy={copyPublicUrl}
                onRefresh={feedback?.kind === 'uncertain' ? refreshUncertainStatus : undefined}
                refreshDisabled={isBusy}
              />

              <form
                className="space-y-4"
                noValidate
                onSubmit={form.handleSubmit(
                  isFirstPublish ? handleFirstPublish : handleMetadataSave,
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor={`publication-slug-${pageId}`}>Адрес публикации</Label>
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="text-sm text-muted-foreground">
                      /p/
                    </span>
                    <Input
                      {...form.register('slug')}
                      aria-describedby={
                        form.formState.errors.slug ? `publication-slug-error-${pageId}` : undefined
                      }
                      aria-invalid={Boolean(form.formState.errors.slug)}
                      autoComplete="off"
                      disabled={isBusy}
                      id={`publication-slug-${pageId}`}
                      maxLength={100}
                    />
                  </div>
                  {form.formState.errors.slug ? (
                    <FieldError id={`publication-slug-error-${pageId}`}>
                      {form.formState.errors.slug.message}
                    </FieldError>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`publication-seo-title-${pageId}`}>SEO title</Label>
                  <Input
                    {...form.register('seoTitle')}
                    aria-describedby={
                      form.formState.errors.seoTitle
                        ? `publication-seo-title-error-${pageId}`
                        : undefined
                    }
                    aria-invalid={Boolean(form.formState.errors.seoTitle)}
                    disabled={isBusy}
                    id={`publication-seo-title-${pageId}`}
                    maxLength={255}
                  />
                  {form.formState.errors.seoTitle ? (
                    <FieldError id={`publication-seo-title-error-${pageId}`}>
                      {form.formState.errors.seoTitle.message}
                    </FieldError>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`publication-seo-description-${pageId}`}>SEO description</Label>
                  <Textarea
                    {...form.register('seoDescription')}
                    aria-describedby={
                      form.formState.errors.seoDescription
                        ? `publication-seo-description-error-${pageId}`
                        : undefined
                    }
                    aria-invalid={Boolean(form.formState.errors.seoDescription)}
                    disabled={isBusy}
                    id={`publication-seo-description-${pageId}`}
                    maxLength={1000}
                  />
                  {form.formState.errors.seoDescription ? (
                    <FieldError id={`publication-seo-description-error-${pageId}`}>
                      {form.formState.errors.seoDescription.message}
                    </FieldError>
                  ) : null}
                </div>

                {feedback ? <FeedbackMessage feedback={feedback} /> : null}

                <DialogFooter>
                  {isFirstPublish ? (
                    <Button disabled={isBusy} loading={isOperationPending} type="submit">
                      Опубликовать
                    </Button>
                  ) : (
                    <>
                      <Button
                        disabled={isBusy || !form.formState.isDirty}
                        loading={isOperationPending}
                        type="submit"
                        variant="outline"
                      >
                        Сохранить настройки
                      </Button>
                      {publication?.status === 'published' ||
                      publication?.status === 'unpublished' ? (
                        <Button
                          disabled={isBusy || republishBaseline !== undefined}
                          loading={isOperationPending}
                          onClick={() => void handleRepublish()}
                          type="button"
                        >
                          {publication.status === 'unpublished'
                            ? 'Опубликовать снова'
                            : 'Republish'}
                        </Button>
                      ) : null}
                      {publication?.status === 'published' ? (
                        <Button
                          disabled={isBusy}
                          onClick={() => setUnpublishOpen(true)}
                          type="button"
                          variant="destructive"
                        >
                          Снять с публикации
                        </Button>
                      ) : null}
                    </>
                  )}
                </DialogFooter>
              </form>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isUnpublishOpen}
        onOpenChange={(open) => !isOperationPending && setUnpublishOpen(open)}
      >
        <DialogContent>
          <DialogTitle>Снять страницу с публикации?</DialogTitle>
          <DialogDescription>
            Публичная ссылка перестанет открывать эту версию страницы.
          </DialogDescription>
          {feedback ? <FeedbackMessage feedback={feedback} /> : null}
          <DialogFooter>
            <DialogClose
              render={<Button disabled={isOperationPending} type="button" variant="outline" />}
            >
              Отмена
            </DialogClose>
            <Button
              disabled={isOperationPending}
              loading={isOperationPending}
              onClick={() => void handleUnpublish()}
              type="button"
              variant="destructive"
            >
              Подтвердить снятие
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusSummary({
  isNeverPublished,
  onCopy,
  onRefresh,
  publication,
  publicUrl,
  refreshDisabled,
}: Readonly<{
  isNeverPublished: boolean;
  onCopy: () => void;
  onRefresh: (() => Promise<void>) | undefined;
  publication: PublicationManagementDto | undefined;
  publicUrl: string | undefined;
  refreshDisabled: boolean;
}>) {
  const label = isNeverPublished
    ? 'Не опубликована'
    : publication?.status === 'draft'
      ? 'Черновик'
      : publication?.status === 'unpublished'
        ? 'Снята с публикации'
        : 'Опубликована';

  return (
    <section aria-label="Состояние публикации" className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">{label}</p>
      {publication?.status === 'published' && publicUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="min-w-0 break-all text-sm underline underline-offset-4"
            href={publicUrl}
            rel="noreferrer"
            target="_blank"
          >
            {publicUrl}
            <ExternalLink aria-hidden="true" className="ml-1 inline size-3" />
          </a>
          <Button onClick={onCopy} size="sm" type="button" variant="ghost">
            <Copy aria-hidden="true" />
            Копировать
          </Button>
        </div>
      ) : null}
      {publication?.publishedAt ? (
        <Text variant="caption">
          Опубликована: {new Date(publication.publishedAt).toLocaleString()}
        </Text>
      ) : null}
      {onRefresh ? (
        <Button
          disabled={refreshDisabled}
          onClick={() => void onRefresh()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" />
          Обновить состояние
        </Button>
      ) : null}
    </section>
  );
}

function FieldError({ children, id }: Readonly<{ children: string | undefined; id: string }>) {
  if (!children) return null;
  return (
    <p className="text-sm text-destructive" id={id} role="alert">
      {children}
    </p>
  );
}

function FeedbackMessage({ feedback }: Readonly<{ feedback: Feedback }>) {
  const role =
    feedback.kind === 'uncertain' ? 'status' : feedback.kind === 'error' ? 'alert' : 'status';
  return (
    <Text
      aria-live={feedback.kind === 'error' ? undefined : 'polite'}
      role={role}
      variant={feedback.kind === 'error' ? 'error' : 'caption'}
    >
      {feedback.message}
    </Text>
  );
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
  setError: ReturnType<typeof useForm<PublicationFormValues>>['setError'],
  setFeedback: (feedback: Feedback) => void,
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

function toFormValues(publication: PublicationManagementDto): PublicationFormValues {
  return {
    slug: publication.slug,
    seoTitle: publication.seoTitle ?? '',
    seoDescription: publication.seoDescription ?? '',
  };
}

function toMetadata(values: PublicationFormValues) {
  return {
    slug: values.slug.trim().toLowerCase(),
    seoTitle: values.seoTitle.trim() || null,
    seoDescription: values.seoDescription.trim() || null,
  };
}

function metadataMatches(
  publication: PublicationManagementDto,
  metadata: ReturnType<typeof toMetadata>,
): boolean {
  return (
    publication.slug === metadata.slug &&
    publication.seoTitle === metadata.seoTitle &&
    publication.seoDescription === metadata.seoDescription
  );
}

function getPublicUrl(publication: PublicationManagementDto | undefined): string | undefined {
  if (publication?.status !== 'published' || !publication.publicPath) return undefined;
  if (publication.publicPath !== `/p/${publication.slug}`) return undefined;
  if (typeof window === 'undefined') return undefined;
  return new URL(publication.publicPath, window.location.origin).toString();
}
