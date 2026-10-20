import type { ReactNode } from 'react';

import { AppProviders } from '@/app/bootstrap';
import { PrivateRoute } from '@/app/routing';
import { WorkspaceDeleteCleanupProvider } from '@/features/workspace-management';
import { PrivateWorkspace } from './private-workspace';

type PrivateLayoutProps = Readonly<{
  children: ReactNode;
}>;

export function PrivateLayout({ children }: PrivateLayoutProps) {
  return (
    <AppProviders>
      <PrivateRoute>
        <WorkspaceDeleteCleanupProvider>
          <PrivateWorkspace>{children}</PrivateWorkspace>
        </WorkspaceDeleteCleanupProvider>
      </PrivateRoute>
    </AppProviders>
  );
}
