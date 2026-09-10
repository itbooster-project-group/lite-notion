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
});
