'use client';

import { useEffect, useState } from 'react';
import { Tooltip } from '@/shared/ui';
import type { PageDocumentPresence, PresenceUser } from '../model/page-document-session';

const VISIBLE_USERS = 5;

export function Participants({ presence }: Readonly<{ presence?: PageDocumentPresence }>) {
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
          <li
            aria-label={user.name}
            className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white"
            data-participant-id={user.id}
            role="img"
            style={{ backgroundColor: user.color }}
          >
            {getInitials(user.name)}
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

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
