import { describe, expect, it, vi } from 'vitest';
import type { CollaborationTransportCallbacks } from '@/shared/collaboration';
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

  it('keeps the same Y.Doc through sync and reconnect, then cleans transport', async () => {
    let callbacks: CollaborationTransportCallbacks | undefined;
    const connect = vi.fn();
    const destroy = vi.fn();
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: { connect }, destroy };
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
    const connect = vi.fn();
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: { connect }, destroy: vi.fn() };
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
    const connect = vi.fn();
    const refresh = vi.fn(async () => undefined);
    const session = createCollaborativePageDocumentSession({
      roomName: 'page:page-id',
      url: 'ws://collaboration.test',
      getAccessToken: () => 'token',
      refreshAccessToken: refresh,
      transportFactory: (options) => {
        callbacks = options.callbacks;
        return { provider: { connect }, destroy: vi.fn() };
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
