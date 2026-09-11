'use client';

import { LoaderCircle } from 'lucide-react';
import { Button as ShadcnButton, type ButtonProps as ShadcnButtonProps } from './shadcn/button';
import { Tooltip } from './tooltip';

export type ButtonProps = ShadcnButtonProps & { loading?: boolean };

export function Button({ loading = false, disabled, children, size, ...props }: ButtonProps) {
  const button = (
    <ShadcnButton
      {...props}
      size={size}
      disabled={disabled || loading}
      focusableWhenDisabled={
        disabled ? props.focusableWhenDisabled : loading || props.focusableWhenDisabled
      }
      aria-busy={loading || props['aria-busy']}
      onClickCapture={(event) => {
        if (loading) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onClickCapture?.(event);
      }}
      onPointerDownCapture={(event) => {
        if (loading) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onPointerDownCapture?.(event);
      }}
      onKeyDownCapture={(event) => {
        if (loading && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onKeyDownCapture?.(event);
      }}
      onKeyUpCapture={(event) => {
        if (loading && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        props.onKeyUpCapture?.(event);
      }}
    >
      {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
      {children}
    </ShadcnButton>
  );
  const label = props['aria-label'];
  return size?.startsWith('icon') && label ? (
    <Tooltip
      label={label}
      disabled={Boolean(
        disabled || loading || props['aria-disabled'] === true || props['aria-disabled'] === 'true',
      )}
    >
      {button}
    </Tooltip>
  ) : (
    button
  );
}
