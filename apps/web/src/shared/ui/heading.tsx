import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/shared/lib/cn';

const headingVariants = cva('', {
  variants: {
    variant: {
      hero: 'text-heading-hero font-semibold tracking-tight',
      page: 'text-heading-page font-semibold tracking-tight',
      section: 'text-heading-section font-semibold',
    },
  },
});

type HeadingVariant = NonNullable<VariantProps<typeof headingVariants>['variant']>;

export type HeadingProps = Omit<ComponentPropsWithoutRef<'h1'>, 'className'> & {
  as: 'h1' | 'h2' | 'h3';
  className?: string;
  variant: HeadingVariant;
};

export function Heading({ as: Component, className, variant, ...props }: HeadingProps) {
  return <Component className={cn(headingVariants({ variant }), className)} {...props} />;
}
