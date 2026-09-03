import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/shared/lib/cn';

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-copy-body',
      muted: 'text-copy-body text-muted-foreground',
      small: 'text-copy-small',
      caption: 'text-copy-small text-muted-foreground',
      error: 'text-copy-small text-destructive',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

type TextVariant = NonNullable<VariantProps<typeof textVariants>['variant']>;

type TextOwnProps = Readonly<{
  className?: string;
  variant?: TextVariant;
}>;

type ParagraphTextProps = Omit<ComponentPropsWithoutRef<'p'>, 'className'> &
  TextOwnProps & {
    as?: 'p';
  };

type SpanTextProps = Omit<ComponentPropsWithoutRef<'span'>, 'className'> &
  TextOwnProps & {
    as: 'span';
  };

export type TextProps = ParagraphTextProps | SpanTextProps;

export function Text(props: TextProps) {
  if (props.as === 'span') {
    const { as: _as, className, variant, ...spanProps } = props;
    return <span className={cn(textVariants({ variant }), className)} {...spanProps} />;
  }

  const { as: _as, className, variant, ...paragraphProps } = props;
  return <p className={cn(textVariants({ variant }), className)} {...paragraphProps} />;
}
