import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
  type onAuthenticationFailedParameters,
  type onStatusParameters,
} from '@hocuspocus/provider';
import type * as Y from 'yjs';

export type CollaborationTransportCallbacks = Readonly<{
  onAuthenticationFailed?: (data: onAuthenticationFailedParameters) => void;
  onDisconnect?: () => void;
  onStatus?: (data: onStatusParameters) => void;
  onSynced?: () => void;
}>;

export type CollaborationProvider = Pick<HocuspocusProvider, 'awareness' | 'connect'>;

export type CollaborationTransport = Readonly<{
  provider: CollaborationProvider;
  destroy(): void;
}>;

export function createCollaborationTransport(
  options: Readonly<{
    roomName: string;
    url: string;
    document: Y.Doc;
    token: () => Promise<string>;
    callbacks?: CollaborationTransportCallbacks;
  }>,
): CollaborationTransport {
  const websocket = new HocuspocusProviderWebsocket({ url: options.url, autoConnect: false });
  const provider = new HocuspocusProvider({
    name: options.roomName,
    document: options.document,
    websocketProvider: websocket,
    token: options.token,
    onAuthenticationFailed: options.callbacks?.onAuthenticationFailed ?? (() => undefined),
    onDisconnect: () => options.callbacks?.onDisconnect?.(),
    onStatus: options.callbacks?.onStatus ?? (() => undefined),
    onSynced: ({ state }) => {
      if (state) options.callbacks?.onSynced?.();
    },
  });
  provider.attach();
  void websocket.connect();
  return {
    provider,
    destroy() {
      provider.destroy();
      websocket.destroy();
    },
  };
}
