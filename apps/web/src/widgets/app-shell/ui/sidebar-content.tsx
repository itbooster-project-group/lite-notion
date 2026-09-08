import type { ReactNode } from 'react';

type SidebarContentProps = Readonly<{
  actions?: ReactNode;
  pageTree?: ReactNode;
  user?: ReactNode;
}>;

export function SidebarContent({ actions, pageTree, user }: SidebarContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {user ? <div data-slot="sidebar-user">{user}</div> : null}
      {actions ? <div data-slot="sidebar-actions">{actions}</div> : null}
      {pageTree ? (
        <div className="min-h-0 flex-1 overflow-y-auto" data-slot="sidebar-page-tree">
          {pageTree}
        </div>
      ) : null}
    </div>
  );
}
