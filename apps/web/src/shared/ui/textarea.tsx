import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/cn';
import { type ControlSize, controlPadding } from './control-size';
import { Textarea as ShadcnTextarea } from './shadcn/textarea';

export type TextareaProps = ComponentProps<typeof ShadcnTextarea> & { controlSize?: ControlSize };

export function Textarea({
  className,
  controlSize = 'default',
  rows = 3,
  ...props
}: TextareaProps) {
  return (
    <ShadcnTextarea
      {...props}
      rows={rows}
      className={cn(
        'field-sizing-fixed min-h-0 resize-y rounded-lg',
        controlPadding[controlSize],
        className,
      )}
    />
  );
}
