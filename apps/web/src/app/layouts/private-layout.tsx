import type { ReactNode } from 'react';

import { PrivateRoute } from '@/app/routing';
import { PrivateShell } from '@/widgets/private-shell';

type PrivateLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateLayout({ children }: PrivateLayoutProps) {
  return (
    <PrivateRoute>
      <PrivateShell>{children}</PrivateShell>
    </PrivateRoute>
  );
}
