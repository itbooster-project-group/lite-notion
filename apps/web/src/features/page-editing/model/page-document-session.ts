import type * as Y from 'yjs';
import type { CollaborationProvider } from '@/shared/collaboration';

export type PresenceUser = Readonly<{
  id: string;
  name: string;
  color: string;
}>;

export type PageDocumentPresence = Readonly<{
  users: readonly PresenceUser[];
  subscribe(listener: () => void): () => void;
}>;

export type PageDocumentEditorCollaboration = Readonly<{
  provider: CollaborationProvider;
  user: PresenceUser;
}>;

export type PageDocumentSessionStatus = 'loading' | 'ready' | 'error';
export type PageDocumentConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

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
  presence?: PageDocumentPresence;
  editorCollaboration?: PageDocumentEditorCollaboration;
  status: PageDocumentSessionStatus;
  error?: PageDocumentError;
  connectionStatus?: PageDocumentConnectionStatus;
  subscribe?(listener: () => void): () => void;
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
