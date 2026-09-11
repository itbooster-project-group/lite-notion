'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/entities/session';
import {
  createCollaborativePageDocumentSession,
  type PageDocumentSession,
  pageRoomName,
} from '@/features/page-editing';
import { PageEditor } from '@/widgets/page-editor';

export function CollaborativePageEditor({ pageId }: Readonly<{ pageId: string }>) {
  const auth = useSession();
  const [session, setSession] = useState<PageDocumentSession | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    const getToken = auth.getAccessToken ?? (() => undefined);
    const refreshToken = auth.refreshAccessToken ?? (async () => undefined);
    const nextSession = createCollaborativePageDocumentSession({
      roomName: pageRoomName(pageId),
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL ?? '',
      getAccessToken: getToken,
      refreshAccessToken: refreshToken,
    });
    setSession(nextSession);
    const unsubscribe = nextSession.subscribe?.(() => rerender((value) => value + 1));
    return () => {
      unsubscribe?.();
      nextSession.destroy();
      setSession((current) => (current === nextSession ? null : current));
    };
  }, [auth.getAccessToken, auth.refreshAccessToken, pageId]);

  if (!session) return <div aria-busy="true">Подготавливаем документ…</div>;

  return (
    <div className="space-y-3">
      <div aria-live="polite" data-collaboration-status={session.connectionStatus ?? 'offline'}>
        {connectionLabel(session.connectionStatus)}
      </div>
      <PageEditor session={session} />
    </div>
  );
}

function connectionLabel(status: PageDocumentSession['connectionStatus']) {
  if (status === 'connected') return 'Подключено';
  if (status === 'reconnecting') return 'Переподключение…';
  if (status === 'connecting') return 'Подключение…';
  return 'Офлайн';
}
