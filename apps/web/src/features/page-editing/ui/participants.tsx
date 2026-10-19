'use client';

import { useEffect, useState } from 'react';
import { useAssetReadUrl } from '@/entities/asset';
import { resolvePresenceColor } from '@/shared/lib/presence-color';
import { AssetImage, Tooltip } from '@/shared/ui';
import type { PageDocumentPresence, PresenceUser } from '../model/page-document-session';

const VISIBLE_USERS = 5;

export function Participants({
  currentUserId,
  presence,
}: Readonly<{
  currentUserId?: string | undefined;
  presence?: PageDocumentPresence | undefined;
}>) {
  const [users, setUsers] = useState<readonly PresenceUser[]>(presence?.users ?? []);

  useEffect(() => {
    if (!presence) {
      setUsers([]);
      return;
    }

    const update = () => setUsers(presence.users);
    update();
    return presence.subscribe(update);
  }, [presence]);

  if (users.length === 0) return null;

  const visibleUsers = users.slice(0, VISIBLE_USERS);
  const hiddenCount = users.length - visibleUsers.length;

  return (
    <ul
      aria-label="Участники документа"
      className="flex list-none items-center gap-1 p-0"
      data-participants=""
    >
      {visibleUsers.map((user) => (
        <Tooltip key={user.id} label={user.name}>
          <li className="size-7" data-participant-id={user.id}>
            <ParticipantAvatar currentUserId={currentUserId} user={user} />
          </li>
        </Tooltip>
      ))}
      {hiddenCount > 0 ? (
        <li aria-label={`Ещё ${hiddenCount} участников`} className="text-xs text-muted-foreground">
          +{hiddenCount}
        </li>
      ) : null}
    </ul>
  );
}

function ParticipantAvatar({
  currentUserId,
  user,
}: Readonly<{ currentUserId?: string | undefined; user: PresenceUser }>) {
  const avatar = useAssetReadUrl(user.avatarAssetId, currentUserId, {
    id: user.id,
    kind: 'avatar',
  });
  return (
    <AssetImage
      alt={`${user.name}: аватар`}
      className="size-7 rounded-full object-cover"
      fallback={
        <span
          aria-label={user.name}
          className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
          role="img"
          style={{ backgroundColor: resolvePresenceColor(user.id, user.color) }}
        >
          {getInitials(user.name)}
        </span>
      }
      height={28}
      onImageError={avatar.onImageError}
      onImageLoad={avatar.onImageLoad}
      src={avatar.src}
      state={user.avatarAssetId ? avatar.state : 'unavailable'}
      width={28}
    />
  );
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
