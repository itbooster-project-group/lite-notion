'use client';

import { Input, Text } from '@/shared/ui';

type PageDraftProps = Readonly<{
  error: string | undefined;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  value: string;
}>;

export function PageDraft({ error, onCancel, onChange, onSubmit, pending, value }: PageDraftProps) {
  return (
    <div className="space-y-1 rounded-md border bg-background p-2">
      <Input
        autoFocus
        aria-label="Название новой страницы"
        aria-invalid={Boolean(error)}
        disabled={pending}
        maxLength={255}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {error ? (
        <Text role="alert" variant="error">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
