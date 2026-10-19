'use client';

import { useCallback, useRef, useState } from 'react';
import {
  AssetUploadError,
  getAssetMetadata,
  initiateAssetUpload,
  uploadAssetContentWithProgress,
} from '@/shared/api';

type UploadOperation = Readonly<{ assetId: string; file: File; pageId?: string }>;
type UploadState = Readonly<{
  assetId?: string;
  error?: string;
  progress: number;
  retryable?: boolean;
  status: 'idle' | 'uploading' | 'ready' | 'failed' | 'unresolved';
}>;

const INITIAL_STATE: UploadState = { progress: 0, status: 'idle' };

export function useImageAssetUpload() {
  const [state, setState] = useState(INITIAL_STATE);
  const [initiationUncertain, setInitiationUncertain] = useState(false);
  const [needsFileReselection, setNeedsFileReselection] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const operation = useRef<UploadOperation | undefined>(undefined);
  const active = useRef(false);

  const execute = useCallback(async (current: UploadOperation) => {
    setState((previous) => {
      const { error: _error, retryable: _retryable, ...current } = previous;
      return { ...current, progress: 0, status: 'uploading' };
    });
    try {
      const result = await uploadAssetContentWithProgress(
        current.assetId,
        current.file,
        ({ loaded, total }) => {
          setState((previous) => ({
            ...previous,
            progress: total ? Math.round((loaded / total) * 100) : 0,
          }));
        },
      );
      operation.current = undefined;
      setState({ assetId: result.id, progress: 100, status: 'ready' });
      return result.id;
    } catch (error) {
      const status = error instanceof AssetUploadError ? error.status : getStatus(error);
      if (status === 409) {
        operation.current = undefined;
        setNeedsFileReselection(true);
        if (current.pageId) {
          try {
            const metadata = await getAssetMetadata(current.assetId, { pageId: current.pageId });
            if (metadata.id === current.assetId && metadata.status === 'ready') {
              setNeedsFileReselection(false);
              setState({ assetId: metadata.id, progress: 100, status: 'ready' });
              return metadata.id;
            }
          } catch {
            // Metadata only confirms ready; other outcomes remain indistinguishable.
          }
        }
        setState({
          error:
            'Загрузка столкнулась с конфликтом. Состояние файла не подтверждено; выберите файл заново.',
          progress: 0,
          status: 'unresolved',
        });
        return undefined;
      }

      const retryable = isRetryableUploadError(error, status);
      if (!retryable || status === 403 || status === 401) {
        operation.current = undefined;
        setNeedsFileReselection(true);
      }
      if (status === 401 || status === 403) setPermissionDenied(true);
      const message =
        status === 403
          ? 'Нет прав загружать изображение для этой страницы.'
          : status === 401
            ? 'Сессия завершена. Войдите снова и повторите загрузку.'
            : error instanceof AssetUploadError && error.ambiguous
              ? 'Сервер мог завершить загрузку, но ответ не получен. Повторите ту же попытку или выберите другой файл.'
              : 'Не удалось загрузить изображение. Повторите попытку.';
      setState((previous) => ({
        ...previous,
        error: message,
        progress: 0,
        retryable,
        status: 'failed',
      }));
      return undefined;
    } finally {
      active.current = false;
    }
  }, []);

  const upload = useCallback(
    async (file: File, pageId?: string) => {
      if (active.current || operation.current || initiationUncertain) return undefined;
      active.current = true;
      setState({ progress: 0, status: 'uploading' });
      try {
        const initiated = await initiateAssetUpload({
          fileName: file.name,
          ...(pageId ? { pageId } : {}),
        });
        const nextOperation = { assetId: initiated.assetId, file, ...(pageId ? { pageId } : {}) };
        operation.current = nextOperation;
        return await execute(nextOperation);
      } catch (error) {
        const status = getStatus(error);
        const uncertain = status === undefined || status >= 500;
        if (uncertain) setInitiationUncertain(true);
        if (status === 401 || status === 403) setPermissionDenied(true);
        setState({
          error: uncertain
            ? 'Сервер мог начать загрузку, но ответ не получен. Обновите страницу перед новой попыткой, чтобы не создать дубликат.'
            : status === 403
              ? 'Нет прав начать загрузку изображения для этой страницы.'
              : status === 401
                ? 'Сессия завершена. Войдите снова и повторите загрузку.'
                : 'Не удалось начать загрузку изображения.',
          progress: 0,
          status: 'failed',
        });
        return undefined;
      } finally {
        active.current = false;
      }
    },
    [execute, initiationUncertain],
  );

  const retry = useCallback(() => {
    if (!operation.current || active.current || !state.retryable) return Promise.resolve(undefined);
    active.current = true;
    return execute(operation.current);
  }, [execute, state.retryable]);

  const selectNewFile = useCallback(() => {
    if (active.current || permissionDenied) return false;
    const warnAboutUnknownResult =
      initiationUncertain ||
      state.status === 'unresolved' ||
      (state.status === 'failed' && state.error?.includes('ответ не получен'));
    operation.current = undefined;
    setInitiationUncertain(false);
    setNeedsFileReselection(false);
    setState({
      ...(warnAboutUnknownResult
        ? {
            error:
              'Предыдущая загрузка могла завершиться на сервере. Новый файл загрузится отдельно.',
          }
        : {}),
      progress: 0,
      status: warnAboutUnknownResult ? 'unresolved' : 'idle',
    });
    return true;
  }, [initiationUncertain, permissionDenied, state.error, state.status]);

  return {
    ...state,
    canRetry: operation.current !== undefined && state.retryable === true,
    canSelectNewFile: !active.current && !permissionDenied,
    canStartNew:
      operation.current === undefined &&
      !initiationUncertain &&
      !needsFileReselection &&
      !permissionDenied,
    retry,
    selectNewFile,
    upload,
  };
}

function isRetryableUploadError(error: unknown, status: number | undefined): boolean {
  if (error instanceof AssetUploadError && error.ambiguous) return true;
  return status === 408 || status === 429 || (status !== undefined && status >= 500);
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}
