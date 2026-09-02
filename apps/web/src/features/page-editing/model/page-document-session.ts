import type * as Y from 'yjs';

export type PageDocumentSessionStatus = 'loading' | 'ready' | 'error';

export type PageDocumentErrorCode =
  | 'unsupported-schema-version'
  | 'invalid-document-metadata'
  | 'document-decode-failed';

export type PageDocumentError = Readonly<{
  code: PageDocumentErrorCode;
  message: string;
}>;

export type PageDocumentSession = Readonly<{
  doc: Y.Doc | null;
  editable: boolean;
  status: PageDocumentSessionStatus;
  error?: PageDocumentError;
  destroy(): void;
}>;

export type PageDocumentSessionLifecycle = Readonly<{
  isDestroyed(): boolean;
  addCleanup(cleanup: () => void): () => void;
  guard<Arguments extends unknown[]>(
    callback: (...arguments_: Arguments) => void,
  ): (...arguments_: Arguments) => void;
  destroy(): void;
}>;

export function createPageDocumentSessionLifecycle(): PageDocumentSessionLifecycle {
  const cleanups = new Set<() => void>();
  let destroyed = false;

  return {
    isDestroyed: () => destroyed,
    addCleanup(cleanup) {
      if (destroyed) {
        cleanup();
        return () => undefined;
      }

      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    guard(callback) {
      return (...arguments_) => {
        if (!destroyed) callback(...arguments_);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;

      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}
