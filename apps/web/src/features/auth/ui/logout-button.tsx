'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useSession } from '@/entities/session';
import { logout } from '@/shared/api';
import { Button, Text } from '@/shared/ui';

export function LogoutButton() {
  const router = useRouter();
  const { clearSession } = useSession();
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setError(undefined);
    setIsPending(true);

    try {
      await logout();
      clearSession();
      router.replace('/login');
    } catch (requestError) {
      if (getStatus(requestError) === 401) {
        clearSession();
        router.replace('/login');
        return;
      }

      setError('Не удалось выйти. Попробуйте ещё раз.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={isPending}
        onClick={() => void handleLogout()}
        type="button"
        variant="outline"
      >
        {isPending ? 'Выходим…' : 'Выйти'}
      </Button>
      {error ? (
        <Text variant="error" className="text-xs" role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : undefined;
}
