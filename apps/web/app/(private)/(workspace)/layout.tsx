import type { ReactNode } from 'react';
import { WorkspaceDeleteCleanupProvider } from '@/features/workspace-management';

export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <WorkspaceDeleteCleanupProvider>{children}</WorkspaceDeleteCleanupProvider>;
}
