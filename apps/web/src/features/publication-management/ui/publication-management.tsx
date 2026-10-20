'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, ExternalLink, Globe, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { PageCapabilities } from '@/entities/page';
import type { PublicationManagementDto } from '@/shared/api';
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
import {
  type PublicationFeedback,
  type PublicationFormValues,
  publicationFormSchema,
  usePublicationManagement,
} from '../model/use-publication-management';

type PublicationManagementProps = Readonly<{
  pageId: string;
  capabilities: PageCapabilities;
}>;

export function PublicationManagement({ capabilities, pageId }: PublicationManagementProps) {
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [isUnpublishOpen, setUnpublishOpen] = useState(false);
  const form = useForm<PublicationFormValues>({
    defaultValues: { slug: '', seoTitle: '', seoDescription: '' },
    resolver: zodResolver(publicationFormSchema),
  });
  const management = usePublicationManagement({
    capabilities,
    pageId,
    setError: form.setError,
    onApply: (publication, resetForm) => {
      if (resetForm) form.reset(toFormValues(publication));
    },
  });
  const {
    feedback,
    isBusy,
    isFirstPublish,
    isNeverPublished,
    isOperationPending,
    isQueryError,
    publication,
    publicationQuery,
    republishBaseline,
  } = management;
  const publicUrl = getPublicUrl(publication);

  useEffect(() => {
    if (publication && !form.formState.isDirty) form.reset(toFormValues(publication));
  }, [form, publication]);

  if (!capabilities.canManagePage) return null;

  function copyPublicUrl() {
    if (!publicUrl) return;
    void navigator.clipboard
      .writeText(publicUrl)
      .then(() =>
        management.setFeedback({ kind: 'success', message: 'Публичная ссылка скопирована.' }),
      )
      .catch(() =>
        management.setFeedback({ kind: 'error', message: 'Не удалось скопировать ссылку.' }),
      );
  }

  async function confirmUnpublish() {
    if (await management.unpublish()) setUnpublishOpen(false);
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
                onRefresh={
                  feedback?.kind === 'uncertain' ? management.refreshUncertainStatus : undefined
                }
                refreshDisabled={isBusy}
              />

              <form
                className="space-y-4"
                noValidate
                onSubmit={form.handleSubmit(
                  isFirstPublish ? management.publish : management.saveMetadata,
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
                  <FieldError id={`publication-slug-error-${pageId}`}>
                    {form.formState.errors.slug?.message}
                  </FieldError>
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
                  <FieldError id={`publication-seo-title-error-${pageId}`}>
                    {form.formState.errors.seoTitle?.message}
                  </FieldError>
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
                  <FieldError id={`publication-seo-description-error-${pageId}`}>
                    {form.formState.errors.seoDescription?.message}
                  </FieldError>
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
                          onClick={() => void management.republish()}
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
              onClick={() => void confirmUnpublish()}
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
  return children ? (
    <p className="text-sm text-destructive" id={id} role="alert">
      {children}
    </p>
  ) : null;
}

function FeedbackMessage({ feedback }: Readonly<{ feedback: PublicationFeedback }>) {
  const role = feedback.kind === 'error' ? 'alert' : 'status';
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

function toFormValues(publication: PublicationManagementDto): PublicationFormValues {
  return {
    slug: publication.slug,
    seoTitle: publication.seoTitle ?? '',
    seoDescription: publication.seoDescription ?? '',
  };
}

function getPublicUrl(publication: PublicationManagementDto | undefined): string | undefined {
  if (publication?.status !== 'published' || publication.publicPath !== `/p/${publication.slug}`) {
    return undefined;
  }
  return typeof window === 'undefined'
    ? undefined
    : new URL(publication.publicPath, window.location.origin).toString();
}
