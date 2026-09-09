'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type { ReactElement } from 'react';

type TooltipProps = Readonly<{ children: ReactElement; label: string; disabled?: boolean }>;

export function Tooltip({ children, label, disabled }: TooltipProps) {
  return (
    <TooltipPrimitive.Root disabled={disabled}>
      <TooltipPrimitive.Trigger render={children} delay={300} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner sideOffset={6} className="z-[100]">
          <TooltipPrimitive.Popup className="max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md">
            {label}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
