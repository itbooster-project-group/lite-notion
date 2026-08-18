import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export function SmokeForm() {
  return (
      <form className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="smoke-note">
          Название заметки
        </label>
        <Input id="smoke-note" name="note" placeholder="Название заметки" />
        <Button type="button">Создать заметку</Button>
      </form>
  );
}


export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Lite Notion</h1>
          <p className="text-muted-foreground">
            Tailwind CSS, shadcn/ui и FSD готовы к дальнейшей разработке интерфейса.
          </p>
        </div>
        <SmokeForm />
      </div>
    </main>
  );
}
