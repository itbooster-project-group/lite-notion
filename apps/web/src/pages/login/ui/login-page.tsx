import { Suspense } from 'react';

import { LoginForm } from '@/features/auth';
import { Text } from '@/shared/ui';

export function LoginPage() {
  return (
    <Suspense
      fallback={
        <Text className="p-6 text-center" variant="small">
          Загружаем форму…
        </Text>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
