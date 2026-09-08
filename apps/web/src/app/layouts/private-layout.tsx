import type { ReactNode } from 'react';

import { PrivateRoute } from '@/app/routing';
import { WorkspaceDeleteCleanupProvider } from '@/features/workspace-management';
import { PrivateWorkspace } from './private-workspace';

type PrivateLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateLayout({ children }: PrivateLayoutProps) {
  return (
    <PrivateRoute>
      <WorkspaceDeleteCleanupProvider>
        <PrivateWorkspace>{children}</PrivateWorkspace>
      </WorkspaceDeleteCleanupProvider>
    </PrivateRoute>
  );
}
