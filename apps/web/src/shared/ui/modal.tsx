'use client';

import { Dialog } from '@base-ui/react/dialog';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

type ModalProps = Readonly<{
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: ReactElement;
  popupClassName?: string;
}>;

export function Modal({
  children,
  open,
  onOpenChange,
  title,
  trigger,
  popupClassName,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger render={trigger} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-stretch justify-start">
          <Dialog.Popup
            className={cn(
              'h-dvh w-[min(20rem,calc(100vw-3rem))] bg-sidebar text-sidebar-foreground shadow-xl outline-none',
              popupClassName,
            )}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Dialog as ModalPrimitive };
