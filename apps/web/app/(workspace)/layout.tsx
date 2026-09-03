import type { ReactNode } from 'react';

import { AppShell } from '@/widgets/app-shell';

type WorkspaceLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
