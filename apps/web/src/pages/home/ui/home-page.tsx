'use client';

import { useSession } from '@/entities/session';
import { Heading } from '@/shared/ui';

export function HomePage() {
  const { user } = useSession();

  return (
    <main className="mx-auto max-w-shell px-page-inline py-page-block">
      <Heading as="h1" variant="hero">
        Добро пожаловать{user?.name ? `, ${user.name}` : ''}
      </Heading>
    </main>
  );
}
