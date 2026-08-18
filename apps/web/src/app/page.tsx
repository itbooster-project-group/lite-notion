import { SmokeForm } from "@/shared/ui/smoke-form";

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
