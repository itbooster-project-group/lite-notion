'use client';

import { useSession } from '@/entities/session';
import { Heading, Text } from '@/shared/ui';

export function ProfilePage() {
  const { user } = useSession();

  if (user === undefined) {
    return <Text variant="caption">Загружаем профиль…</Text>;
  }

  return (
    <main className="mx-auto max-w-shell px-page-inline py-12">
      <section className="space-y-6" aria-labelledby="profile-title">
        <Heading as="h1" variant="page" id="profile-title">
          Профиль
        </Heading>
        <dl className="space-y-4">
          <ProfileField label="Имя" value={user.name} />
          <ProfileField label="Email" value={user.email} />
          <ProfileField label="Дата регистрации" value={formatDate(user.createdAt)} />
        </dl>
      </section>
    </main>
  );
}

type ProfileFieldProps = Readonly<{
  label: string;
  value: string;
}>;

function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(value));
}
