import { ShieldCheck } from 'lucide-react';
import { PageActionMenuItem } from '@/entities/page';

export function PageAccessMenuItem({ onSelect }: Readonly<{ onSelect: () => void }>) {
  return (
    <PageActionMenuItem icon={ShieldCheck} onSelect={onSelect}>
      Настроить доступ
    </PageActionMenuItem>
  );
}
