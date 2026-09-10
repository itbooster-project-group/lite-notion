import * as Y from 'yjs';
import { createCollaborationTransport } from '@/shared/collaboration';

import {
  createPageDocumentSessionLifecycle,
  type PageDocumentConnectionStatus,
  type PageDocumentError,
  type PageDocumentSession,
} from './page-document-session';

type Options = Readonly<{
  roomName: string;
  url: string;
  editable?: boolean;
  getAccessToken: () => string | undefined;
  refreshAccessToken: () => Promise<void>;
  transportFactory?: typeof createCollaborationTransport;
}>;
const CONFIG_ERROR: PageDocumentError = {
  code: 'document-decode-failed',
  message: 'Collaboration transport недоступен.',
};

export function createCollaborativePageDocumentSession({
  roomName,
  url,
  editable = true,
  getAccessToken,
  refreshAccessToken,
  transportFactory = createCollaborationTransport,
}: Options): PageDocumentSession {
  const lifecycle = createPageDocumentSessionLifecycle();
  const doc = new Y.Doc();
  const listeners = new Set<() => void>();
  let sessionStatus: PageDocumentSession['status'] = 'loading';
  let connectionStatus: PageDocumentConnectionStatus = 'connecting';
  let authRetried = false;
  let transport: ReturnType<typeof createCollaborationTransport> | undefined;
  const notify = lifecycle.guard(() => {
    listeners.forEach((listener) => {
      listener();
    });
  });
  const setConnection = lifecycle.guard((next: PageDocumentConnectionStatus) => {
    connectionStatus = next;
    notify();
  });
  const token = async () => {
    const current = getAccessToken();
    if (current) return current;
    await refreshAccessToken();
    const refreshed = getAccessToken();
    if (!refreshed) throw new Error('Authentication unavailable');
    return refreshed;
  };

  if (!url || !roomName) {
    sessionStatus = 'error';
    connectionStatus = 'offline';
  } else {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      connectionStatus = 'offline';
    }
    if (typeof window !== 'undefined') {
      const handleOffline = () => setConnection('offline');
      const handleOnline = () =>
        setConnection(sessionStatus === 'ready' ? 'reconnecting' : 'connecting');
      window.addEventListener('offline', handleOffline);
      window.addEventListener('online', handleOnline);
      lifecycle.addCleanup(() => {
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('online', handleOnline);
      });
    }
    transport = transportFactory({
      roomName,
      url,
      document: doc,
      token,
      callbacks: {
        onStatus: ({ status }) =>
          setConnection(
            status === 'connected'
              ? 'connected'
              : status === 'connecting'
                ? 'connecting'
                : 'reconnecting',
          ),
        onSynced: () => {
          sessionStatus = 'ready';
          connectionStatus = 'connected';
          notify();
        },
        onDisconnect: () => setConnection(sessionStatus === 'ready' ? 'reconnecting' : 'offline'),
        onAuthenticationFailed: () => {
          if (authRetried) {
            sessionStatus = 'error';
            setConnection('offline');
            return;
          }
          authRetried = true;
          void refreshAccessToken()
            .then(() => transport?.provider.connect())
            .catch(() => {
              sessionStatus = 'error';
              setConnection('offline');
            });
        },
      },
    });
  }

  lifecycle.addCleanup(() => {
    transport?.destroy();
    listeners.clear();
    doc.destroy();
  });

  return {
    get doc() {
      return sessionStatus === 'error' ? null : doc;
    },
    get editable() {
      return editable && sessionStatus === 'ready';
    },
    get status() {
      return sessionStatus;
    },
    get connectionStatus() {
      return connectionStatus;
    },
    ...(sessionStatus === 'error' ? { error: CONFIG_ERROR } : {}),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: lifecycle.destroy,
  };
}
