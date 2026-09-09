import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/cn';
import { type ControlSize, controlHeights } from './control-size';
import { Input as ShadcnInput } from './shadcn/input';

export type InputProps = ComponentProps<typeof ShadcnInput> & { controlSize?: ControlSize };

export function Input({ className, controlSize = 'default', ...props }: InputProps) {
  return (
    <ShadcnInput className={cn('rounded-lg', controlHeights[controlSize], className)} {...props} />
  );
}
