"use client";

import { Button, Input } from "@/shared/ui/index";

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
