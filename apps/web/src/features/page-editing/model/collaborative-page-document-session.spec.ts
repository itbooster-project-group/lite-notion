import { describe, expect, it, vi } from 'vitest';
import type {
  CollaborationProvider,
  CollaborationTransportCallbacks,
} from '@/shared/collaboration';
import { createCollaborativePageDocumentSession } from './collaborative-page-document-session';

describe('collaborative page document session', () => {
  it('fails safely without a configured transport URL', () => {
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: '',
      getAccessToken: () => 'token',
      refreshAccessToken: async () => undefined,
    });

    expect(session.status).toBe('error');
    expect(session.connectionStatus).toBe('offline');
    session.destroy();
    session.destroy();
  });

  it('fails safely before creating a transport for an invalid URL', () => {
    const transportFactory = vi.fn();
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'not-a-websocket-url',
      getAccessToken: () => 'token',
      refreshAccessToken: async () => undefined,
      transportFactory,
    });

    expect(session.status).toBe('error');
    expect(session.connectionStatus).toBe('offline');
    expect(transportFactory).not.toHaveBeenCalled();
    session.destroy();
  });

  it('ignores subscription callbacks after cleanup', () => {
    const session = createCollaborativePageDocumentSession({
      roomName: '',
      url: '',
      getAccessToken: () => undefined,
      refreshAccessToken: async () => undefined,
    });
    const listener = vi.fn();
    session.subscribe?.(listener);

    session.destroy();
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the session alive through temporary disconnect', () => {
    let callbacks: CollaborationTransportCallbacks | undefined;
    const destroy = vi.fn();
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: async () => undefined,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: createTestProvider(vi.fn(async () => undefined)), destroy };
      },
    });

    callbacks?.onSynced?.();
    callbacks?.onDisconnect?.();

    expect(session.connectionStatus).toBe('reconnecting');
    expect(session.status).toBe('ready');
    expect(destroy).not.toHaveBeenCalled();

    session.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('projects Awareness updates for a viewer and removes the listener on destroy', () => {
    const awareness = createTestAwareness();
    const listener = vi.fn();
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      editable: false,
      user: { id: 'viewer-id', name: 'Viewer' },
      getAccessToken: () => 'token',
      refreshAccessToken: async () => undefined,
      transportFactory: () => ({
        provider: { awareness: awareness.provider, connect: async () => undefined },
        destroy: vi.fn(),
      }),
    });

    session.presence?.subscribe(listener);
    awareness.states.set(12, { user: { id: 'viewer-id', name: 'Viewer', color: '#2563eb' } });
    awareness.emitChange();

    expect(session.editable).toBe(false);
    expect(session.presence?.users).toEqual([
      { id: 'viewer-id', name: 'Viewer', color: '#2563eb' },
    ]);
    expect(listener).toHaveBeenCalledOnce();

    session.destroy();
    awareness.states.set(13, { user: { id: 'other', name: 'Other', color: '#16a34a' } });
    awareness.emitChange();

    expect(awareness.off).toHaveBeenCalledOnce();
    expect(session.presence?.users).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('keeps the same Y.Doc through sync and reconnect, then cleans transport', async () => {
    let callbacks: CollaborationTransportCallbacks | undefined;
    const connect = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: createTestProvider(connect), destroy };
      },
    });
    const document = session.doc;

    callbacks?.onSynced?.();
    expect(session.status).toBe('ready');
    expect(session.doc).toBe(document);
    callbacks?.onDisconnect?.();
    expect(session.connectionStatus).toBe('reconnecting');
    window.dispatchEvent(new Event('offline'));
    expect(session.connectionStatus).toBe('offline');
    window.dispatchEvent(new Event('online'));
    expect(session.connectionStatus).toBe('reconnecting');
    callbacks?.onAuthenticationFailed?.({ reason: 'unauthorized' });
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();

    session.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(session.doc).toBe(document);
  });

  it('allows a second auth retry cycle after successful synchronization', async () => {
    let callbacks: CollaborationTransportCallbacks | undefined;
    const connect = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: createTestProvider(connect), destroy: vi.fn() };
      },
    });

    callbacks?.onAuthenticationFailed?.({ reason: 'expired' });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    callbacks?.onSynced?.();

    callbacks?.onAuthenticationFailed?.({ reason: 'expired-again' });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    callbacks?.onSynced?.();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(session.status).toBe('ready');
    expect(session.connectionStatus).toBe('connected');
    session.destroy();
  });

  it('enters terminal error after two auth failures without synchronization', async () => {
    let callbacks: CollaborationTransportCallbacks | undefined;
    const connect = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: createTestProvider(connect), destroy: vi.fn() };
      },
    });

    callbacks?.onAuthenticationFailed?.({ reason: 'expired' });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    callbacks?.onAuthenticationFailed?.({ reason: 'still-expired' });

    expect(session.status).toBe('error');
    expect(session.connectionStatus).toBe('offline');
    expect(refresh).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
    session.destroy();
  });
});

function createTestProvider(connect: () => Promise<unknown>): CollaborationProvider {
  return {
    awareness: null,
    connect,
  };
}

function createTestAwareness() {
  let listener: (() => void) | undefined;
  const states = new Map<number, unknown>();
  const on = vi.fn((_event: 'change', next: () => void) => {
    listener = next;
  });
  const off = vi.fn(() => {
    listener = undefined;
  });
  const provider = {
    getStates: () => states,
    on,
    off,
  } as unknown as NonNullable<CollaborationProvider['awareness']>;

  return {
    off,
    provider,
    states,
    emitChange: () => listener?.(),
  };
}
