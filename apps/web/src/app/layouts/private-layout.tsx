import type { ReactNode } from 'react';

import { PrivateRoute } from '@/app/routing';
import { PrivateWorkspace } from './private-workspace';

type PrivateLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateLayout({ children }: PrivateLayoutProps) {
  return (
    <PrivateRoute>
      <PrivateWorkspace>{children}</PrivateWorkspace>
    </PrivateRoute>
  );
}
