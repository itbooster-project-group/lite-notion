import type { ReactNode } from 'react';

import { AuthRoute } from '@/app/routing';

type AuthLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function AuthLayout({ children }: AuthLayoutProps) {
  return <AuthRoute>{children}</AuthRoute>;
}
