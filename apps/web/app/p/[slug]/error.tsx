'use client';

export default function PublicationError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <h1 className="text-2xl font-semibold">Страница временно недоступна</h1>
      <p className="mt-3 text-muted-foreground">
        Не удалось загрузить опубликованную страницу. Попробуйте позже.
      </p>
      <button className="mt-6 rounded-md border px-4 py-2" onClick={reset} type="button">
        Повторить
      </button>
    </main>
  );
}
