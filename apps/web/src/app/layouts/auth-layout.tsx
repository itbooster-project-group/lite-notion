import type { ReactNode } from 'react';

import { AppProviders } from '@/app/bootstrap';
import { AuthRoute } from '@/app/routing';

type AuthLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <AppProviders>
      <AuthRoute>{children}</AuthRoute>
    </AppProviders>
  );
}
