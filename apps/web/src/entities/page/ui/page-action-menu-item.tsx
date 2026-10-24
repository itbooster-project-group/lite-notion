import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { MenuItem } from '@/shared/ui';

type PageActionMenuItemProps = Readonly<{
  children: ReactNode;
  destructive?: boolean;
  icon: LucideIcon;
  onSelect: () => void;
}>;

export function PageActionMenuItem({
  children,
  destructive = false,
  icon: Icon,
  onSelect,
}: PageActionMenuItemProps) {
  return (
    <MenuItem
      className="min-h-11 whitespace-nowrap px-2.5 py-2 text-sm/5 sm:min-h-9 [@media(any-pointer:coarse)]:min-h-11"
      onClick={onSelect}
      variant={destructive ? 'destructive' : 'default'}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </MenuItem>
  );
}
