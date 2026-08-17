## 1. Tailwind и PostCSS

- [x] 1.1 Установить `tailwindcss` и `@tailwindcss/postcss` в `apps/web` и добавить PostCSS-конфигурацию для Next.js
- [x] 1.2 Обновить `src/app/globals.css`: Tailwind v4 imports, shadcn theme tokens, `@custom-variant dark` и базовые `@layer base` стили

## 2. shadcn/ui init (Base UI, Mira)

- [x] 2.1 Создать `apps/web/components.json` со стилем `base-mira`, `baseColor: neutral`, `rsc: true` и aliases на `@/shared/ui/shadcn`, `@/shared/lib/utils`
- [x] 2.2 Запустить `pnpm dlx shadcn@latest init --base base -c apps/web` и убедиться, что `shared/lib/utils.ts` создан с `cn()`
- [x] 2.3 Добавить компоненты `button` и `input` через `pnpm dlx shadcn@latest add button input -c apps/web`; принять `label`, если CLI добавит его как зависимость

## 3. FSD shared layer и публичный UI API

- [x] 3.1 Создать `src/shared/ui/button.tsx` и `input.tsx` как проектные обёртки над
  `./shadcn/*`: сохранить props vendor-компонентов, объединять проектные стили с `className` через
  `cn()`; обновить `index.ts`, чтобы он экспортировал обёртки, а не vendor-компоненты напрямую
- [x] 3.2 Создать `src/shared/ui/theme-provider.tsx` на базе `next-themes` с `attribute="class"`, `defaultTheme="system"`, `enableSystem`
- [x] 3.3 Создать `src/shared/ui/smoke-form.tsx` (`"use client"`) с Input и Button, импортируя из `@/shared/ui`

## 4. Dark mode и layout

- [x] 4.1 Установить `next-themes` в `apps/web`
- [x] 4.2 Обновить `src/app/layout.tsx`: `suppressHydrationWarning` на `<html>`, обёртка children в `ThemeProvider`

## 5. Homepage smoke-test

- [x] 5.1 Обновить `src/app/page.tsx`: заголовок «Lite Notion», описание готовности UI-стека, рендер `SmokeForm`
- [x] 5.2 Удалить устаревшие plain CSS правила из `globals.css`, которые дублируют layout smoke UI (например, центрирование `main`), если они конфликтуют с Tailwind

## 6. Документация для agents

- [ ] 6.1 Обновить `apps/web/AGENTS.md`: снять запрет на Tailwind/shadcn; описать vendor zone
  `shared/ui/shadcn/`, кастомизируемые обёртки `shared/ui/*.tsx`, публичный API `@/shared/ui`,
  правило `shadcn add -c apps/web` и class-based dark mode

## 7. Тесты и проверки

- [x] 7.1 Обновить `src/app/page.spec.tsx`: проверить heading «Lite Notion», textbox и button через accessible queries
- [ ] 7.2 Добавить тесты проектных Button и Input: проверить объединение потребительского
  `className` с проектными классами и передачу поддерживаемых props в vendor-компоненты
- [ ] 7.3 Выполнить `pnpm lint`, `pnpm --filter @lite-notion/web typecheck`, `pnpm --filter @lite-notion/web test`, `pnpm --filter @lite-notion/web build`
