import { Suspense } from 'react';

import { RegisterForm } from '@/features/auth';
import { Text } from '@/shared/ui';

export function RegisterPage() {
  return (
    <Suspense
      fallback={
        <Text className="p-6 text-center" variant="small">
          Загружаем форму…
        </Text>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
