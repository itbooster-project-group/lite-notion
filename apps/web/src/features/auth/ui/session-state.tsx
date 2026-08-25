import { Button, Heading, Text } from '@/shared/ui';

type SessionErrorProps = Readonly<{
  onRetry: () => void;
}>;

export function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-page-inline" aria-busy="true">
      <Text variant="caption">Восстанавливаем сессию…</Text>
    </main>
  );
}

export function SessionError({ onRetry }: SessionErrorProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-page-inline">
      <div className="w-full max-w-auth space-y-content rounded-xl border bg-card p-surface-compact text-center shadow-sm">
        <Heading as="h1" variant="section">
          Не удалось проверить сессию
        </Heading>
        <Text variant="caption" role="alert">
          Проверьте соединение и попробуйте ещё раз.
        </Text>
        <Button type="button" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    </main>
  );
}
