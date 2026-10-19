'use client';

import { useEffect, useRef, useState } from 'react';
import { getPageCapabilities, type PageAccessRole, type PageCapabilities } from '@/entities/page';
import { useSession } from '@/entities/session';
import {
  createCollaborativePageDocumentSession,
  type PageDocumentSession,
  Participants,
  pageRoomName,
} from '@/features/page-editing';
import { PageEditor } from '@/widgets/page-editor';

export function CollaborativePageEditor({
  accessRole,
  capabilities,
  pageId,
}: Readonly<{
  accessRole?: PageAccessRole;
  capabilities?: PageCapabilities;
  pageId: string;
}>) {
  const auth = useSession();
  const userId = auth.user?.id;
  const userName = auth.user?.name;
  const avatarAssetId = auth.user?.avatarAssetId ?? null;
  const avatarAssetIdRef = useRef(avatarAssetId);
  const resolvedCapabilities = capabilities ?? getPageCapabilities(accessRole ?? 'viewer');
  const editable = resolvedCapabilities.canEditContent;
  const [session, setSession] = useState<PageDocumentSession | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    avatarAssetIdRef.current = avatarAssetId;
  }, [avatarAssetId]);

  useEffect(() => {
    const getToken = auth.getAccessToken ?? (() => undefined);
    const refreshToken = auth.refreshAccessToken ?? (async () => undefined);
    const nextSession = createCollaborativePageDocumentSession({
      roomName: pageRoomName(pageId),
      url: process.env.NEXT_PUBLIC_COLLABORATION_URL ?? '',
      editable,
      getAccessToken: getToken,
      refreshAccessToken: refreshToken,
      ...(userId && userName
        ? { user: { id: userId, name: userName, avatarAssetId: avatarAssetIdRef.current } }
        : {}),
    });
    setSession(nextSession);
    const unsubscribe = nextSession.subscribe?.(() => rerender((value) => value + 1));
    return () => {
      unsubscribe?.();
      nextSession.destroy();
      setSession((current) => (current === nextSession ? null : current));
    };
  }, [auth.getAccessToken, auth.refreshAccessToken, editable, pageId, userId, userName]);

  useEffect(() => {
    if (userId && userName)
      session?.updatePresenceUser?.({ id: userId, name: userName, avatarAssetId });
  }, [avatarAssetId, session, userId, userName]);

  if (!session) return <div aria-busy="true">Подготавливаем документ…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div aria-live="polite" data-collaboration-status={session.connectionStatus ?? 'offline'}>
          {connectionLabel(session.connectionStatus)}
        </div>
        {session.presence ? (
          <Participants currentUserId={userId} presence={session.presence} />
        ) : null}
      </div>
      <PageEditor pageId={pageId} session={session} userId={userId} />
    </div>
  );
}

function connectionLabel(status: PageDocumentSession['connectionStatus']) {
  if (status === 'connected') return 'Подключено';
  if (status === 'reconnecting') return 'Переподключение…';
  if (status === 'connecting') return 'Подключение…';
  return 'Офлайн';
}
