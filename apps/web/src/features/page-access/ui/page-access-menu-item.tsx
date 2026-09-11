import { MenuItem } from '@/shared/ui';

export function PageAccessMenuItem({ onSelect }: Readonly<{ onSelect: () => void }>) {
  return <MenuItem onClick={onSelect}>Настроить доступ</MenuItem>;
}
