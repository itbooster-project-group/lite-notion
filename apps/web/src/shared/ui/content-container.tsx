import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type ContentContainerProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    as?: 'div' | 'section';
  }>;

export function ContentContainer({ as = 'div', className, ...props }: ContentContainerProps) {
  const Container = as;

  return (
    <Container
      {...props}
      className={cn('mx-auto w-full max-w-shell px-page-inline py-page-block', className)}
    />
  );
}
