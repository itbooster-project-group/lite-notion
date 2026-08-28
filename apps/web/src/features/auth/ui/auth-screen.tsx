import type { ReactNode } from 'react';

import { Heading, Text } from '@/shared/ui';

type AuthScreenProps = Readonly<{
  children: ReactNode;
  description: string;
  footer: ReactNode;
  title: string;
}>;

export function AuthScreen({ children, description, footer, title }: AuthScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-page-inline py-page-block">
      <div className="w-full max-w-auth space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-primary">Lite Notion</p>
          <Heading as="h1" variant="page">
            {title}
          </Heading>
          <Text variant="caption">{description}</Text>
        </div>
        {children}
        <Text variant="caption" className="text-center">
          {footer}
        </Text>
      </div>
    </main>
  );
}

type FormFieldProps = Readonly<{
  children: ReactNode;
  error: string | undefined;
  htmlFor: string;
  label: string;
}>;

export function FormField({ children, error, htmlFor, label }: FormFieldProps) {
  const errorId = `${htmlFor}-error`;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <Text variant="error" id={errorId}>
          {error}
        </Text>
      ) : null}
    </div>
  );
}
