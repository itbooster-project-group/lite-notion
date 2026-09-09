'use client';

import type { ComponentProps } from 'react';
import { Checkbox as ShadcnCheckbox } from './shadcn/checkbox';
import { useFormValue } from './use-form-value';

export type CheckboxProps = Omit<
  ComponentProps<typeof ShadcnCheckbox>,
  'onCheckedChange' | 'inputRef'
> & {
  onCheckedChange?: (checked: boolean) => void;
};

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  const state = useFormValue(checked, defaultChecked);
  return (
    <ShadcnCheckbox
      {...props}
      checked={state.value}
      inputRef={state.inputRef}
      onCheckedChange={(next) => {
        state.setValue(next);
        onCheckedChange?.(next);
      }}
    />
  );
}
