'use client';

import { useCallback, useRef, useState } from 'react';
import {
  AssetUploadError,
  initiateAssetUpload,
  uploadAssetContentWithProgress,
} from '@/shared/api';

type UploadOperation = Readonly<{ assetId: string; file: File; pageId?: string }>;
type UploadState = Readonly<{
  assetId?: string;
  error?: string;
  progress: number;
  status: 'idle' | 'uploading' | 'ready' | 'failed';
}>;

const INITIAL_STATE: UploadState = { progress: 0, status: 'idle' };

export function useImageAssetUpload() {
  const [state, setState] = useState(INITIAL_STATE);
  const [initiationUncertain, setInitiationUncertain] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const operation = useRef<UploadOperation | undefined>(undefined);
  const active = useRef(false);

  const execute = useCallback(async (current: UploadOperation) => {
    setState((previous) => {
      const { error: _error, ...current } = previous;
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
      if (status === 403) operation.current = undefined;
      if (status === 401 || status === 403) setPermissionDenied(true);
      const message =
        status === 403
          ? 'Нет прав загружать изображение для этой страницы.'
          : status === 401
            ? 'Сессия завершена. Войдите снова и повторите загрузку.'
            : error instanceof AssetUploadError && error.ambiguous
              ? 'Сервер мог завершить загрузку, но ответ не получен. Повторите эту же попытку.'
              : 'Не удалось загрузить изображение. Повторите попытку.';
      setState((previous) => ({ ...previous, error: message, status: 'failed' }));
      return undefined;
    } finally {
      active.current = false;
    }
  }, []);

  const upload = useCallback(
    async (file: File, pageId?: string) => {
      if (active.current || operation.current || initiationUncertain) return undefined;
      active.current = true;
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
    if (!operation.current || active.current) return Promise.resolve(undefined);
    active.current = true;
    return execute(operation.current);
  }, [execute]);

  return {
    ...state,
    canRetry: operation.current !== undefined,
    canStartNew: operation.current === undefined && !initiationUncertain && !permissionDenied,
    retry,
    upload,
  };
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : undefined;
}
