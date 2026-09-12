import * as Y from 'yjs';
import { type CollaborationTransport, createCollaborationTransport } from '@/shared/collaboration';

import {
  createPageDocumentSessionLifecycle,
  type PageDocumentConnectionStatus,
  type PageDocumentEditorCollaboration,
  type PageDocumentError,
  type PageDocumentPresence,
  type PageDocumentSession,
  type PresenceUser,
} from './page-document-session';
import { getPresenceColor, getPresenceUsers } from './presence';

type Options = Readonly<{
  roomName: string;
  url: string;
  editable?: boolean;
  user?: Readonly<{ id: string; name: string }>;
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
  user,
  getAccessToken,
  refreshAccessToken,
  transportFactory = createCollaborationTransport,
}: Options): PageDocumentSession {
  const lifecycle = createPageDocumentSessionLifecycle();
  const doc = new Y.Doc();
  const listeners = new Set<() => void>();
  const presenceListeners = new Set<() => void>();
  let presenceUsers: readonly PresenceUser[] = [];
  let sessionStatus: PageDocumentSession['status'] = 'loading';
  let connectionStatus: PageDocumentConnectionStatus = 'connecting';
  let authRetried = false;
  let transport: CollaborationTransport | undefined;
  const notify = lifecycle.guard(() => {
    listeners.forEach((listener) => {
      listener();
    });
  });
  const setConnection = lifecycle.guard((next: PageDocumentConnectionStatus) => {
    connectionStatus = next;
    notify();
  });
  const notifyPresence = lifecycle.guard(() => {
    presenceListeners.forEach((listener) => {
      listener();
    });
  });
  const updatePresence = lifecycle.guard(() => {
    const awareness = transport?.provider.awareness;
    const nextUsers = awareness ? getPresenceUsers(awareness) : [];
    if (samePresenceUsers(presenceUsers, nextUsers)) return;
    presenceUsers = nextUsers;
    notifyPresence();
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

  if (!isValidCollaborationUrl(url) || !roomName) {
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
          authRetried = false;
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
    const awareness = transport.provider.awareness;
    if (awareness) {
      awareness.on('change', updatePresence);
      lifecycle.addCleanup(() => awareness.off('change', updatePresence));
      updatePresence();
    }
  }

  lifecycle.addCleanup(() => {
    transport?.destroy();
    listeners.clear();
    presenceListeners.clear();
    presenceUsers = [];
    doc.destroy();
  });

  const presence: PageDocumentPresence = {
    get users() {
      return presenceUsers;
    },
    subscribe(listener) {
      presenceListeners.add(listener);
      return () => presenceListeners.delete(listener);
    },
  };
  const editorCollaboration: PageDocumentEditorCollaboration | undefined =
    transport && user && isValidPresenceIdentity(user)
      ? {
          provider: transport.provider,
          user: { id: user.id, name: user.name, color: getPresenceColor(user.id) },
        }
      : undefined;

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
    presence,
    ...(editorCollaboration ? { editorCollaboration } : {}),
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

function isValidPresenceIdentity(user: Readonly<{ id: string; name: string }>): boolean {
  return (
    typeof user.id === 'string' &&
    user.id.length > 0 &&
    typeof user.name === 'string' &&
    user.name.length > 0
  );
}

function samePresenceUsers(
  current: readonly PresenceUser[],
  next: readonly PresenceUser[],
): boolean {
  return (
    current.length === next.length &&
    current.every(
      (user, index) =>
        user.id === next[index]?.id &&
        user.name === next[index]?.name &&
        user.color === next[index]?.color,
    )
  );
}

function isValidCollaborationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}
