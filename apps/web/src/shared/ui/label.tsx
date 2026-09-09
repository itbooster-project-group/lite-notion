import type { ComponentProps } from 'react';
import { Label as ShadcnLabel } from './shadcn/label';

export type LabelProps = ComponentProps<typeof ShadcnLabel>;

export function Label(props: LabelProps) {
  return <ShadcnLabel {...props} />;
}
