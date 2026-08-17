## Context

`apps/web` — минимальное Next.js 16 приложение с plain CSS в `globals.css`. Tailwind, shadcn/ui и FSD-слои отложены при инициализации проекта. Мотивация и границы изменения описаны в `proposal.md`. Требования к наблюдаемому поведению — в `specs/web-ui-foundation/spec.md`.

## Goals / Non-Goals

**Goals:**

- Установить Tailwind CSS v4 и shadcn/ui (Base UI, стиль Mira, `baseColor: neutral`) в `apps/web`.
- Организовать FSD-совместимую структуру с vendor zone для shadcn, отдельными кастомизируемыми
  обёртками и публичным UI API.
- Включить class-based dark mode через `next-themes` без UI toggle.
- Добавить минимальные компоненты `button` и `input` (+ `label`, если потребует CLI).
- Обновить homepage smoke-test и автотесты.
- Обновить `apps/web/AGENTS.md` с правилами работы с UI-стеком.

**Non-Goals:**

- Shared workspace package для UI.
- FSD-слои beyond `shared`.
- Theme toggle, формы с валидацией, продуктовые экраны.
- TanStack Query, Zustand, React Hook Form, Zod.

## Decisions

### 1. Tailwind CSS v4 с CSS-first конфигурацией

Tailwind v4 устанавливается в `apps/web` через `tailwindcss` и `@tailwindcss/postcss`. Конфигурация — в `globals.css` (`@import "tailwindcss"`, `@theme inline`, CSS variables shadcn). Отдельный `tailwind.config.js` не создаётся.

**Альтернатива:** Tailwind v3 + JS config — отклонена как устаревший путь для нового shadcn setup.

### 2. shadcn/ui на Base UI в стиле Mira

Инициализация через CLI из корня репозитория с указанием приложения:

```bash
pnpm dlx shadcn@latest init --base base -c apps/web
```

В `components.json`:

- `"style": "base-mira"`
- `"rsc": true`
- `"tailwind.cssVariables": true`
- `"tailwind.baseColor": "neutral"`

Компоненты добавляются командой `pnpm dlx shadcn@latest add button input -c apps/web` (+ `label`, если CLI добавит как зависимость).

**Альтернатива:** Radix или React Aria — отклонены; в проекте выбран Base UI.

### 3. FSD: vendor zone + публичный barrel

```
apps/web/src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
└── shared/
    ├── lib/
    │   └── cn.ts          ← cn()
    └── ui/
        ├── shadcn/           ← CLI-managed (не редактировать вручную)
        ├── button.tsx        ← проектная обёртка над shadcn/button
        ├── input.tsx         ← проектная обёртка над shadcn/input
        ├── theme-provider.tsx
        ├── smoke-form.tsx    ← "use client" smoke UI
        └── index.ts          ← публичный API
```

`components.json` aliases:

| Alias | Path |
|-------|------|
| `ui` | `@/shared/ui/shadcn` |
| `utils` | `@/shared/lib/utils` |
| `components` | `@/shared/ui` |
| `lib` | `@/shared/lib` |
| `hooks` | `@/shared/lib/hooks` |

Для каждого используемого CLI-managed компонента создаётся одноимённая проектная обёртка уровнем
выше: `shared/ui/button.tsx` использует `shared/ui/shadcn/button.tsx`, а `shared/ui/input.tsx` —
`shared/ui/shadcn/input.tsx`. Обёртки сохраняют публичные props vendor-компонентов, объединяют
проектные классы с потребительским `className` через `cn()` и являются единственным местом для
локальных значений по умолчанию и стилевых расширений.

`shared/ui/index.ts` экспортирует Button, Input (и Label при наличии) из проектных обёрток, а не
напрямую из `shadcn/`. Прикладной код импортирует только `@/shared/ui`. Команды `shadcn add` и
`shadcn add --overwrite` изменяют только vendor zone и не затрагивают проектные обёртки.

**Альтернатива:** `@/components/ui` — отклонена; не согласована с FSD и правилом vendor isolation.

**Альтернатива:** прямые реэкспорты из `shared/ui/shadcn` в публичном barrel — отклонена; они не
дают устойчивого места для проектных стилей и значений по умолчанию, которые переживают обновление
компонентов через shadcn CLI.

**Альтернатива:** `packages/ui` monorepo package — отклонена; в репозитории один потребитель UI.

### 4. Class-based dark mode через next-themes

- Зависимость `next-themes` только в `apps/web`.
- `ThemeProvider` в `shared/ui/theme-provider.tsx` с `attribute="class"`, `defaultTheme="system"`, `enableSystem`.
- Корневой `layout.tsx`: `suppressHydrationWarning` на `<html>`, обёртка children в `ThemeProvider`.
- `globals.css`: `@custom-variant dark (&:is(.dark *));` и `.dark { ... }` tokens от shadcn init.

UI toggle не добавляется; инфраструктура готова для последующего change.

### 5. Homepage остаётся Server Component

Smoke UI выносится в client component `shared/ui/smoke-form.tsx` (`"use client"`), чтобы `page.tsx` оставался Server Component. Форма содержит Input и Button без бизнес-логики submit.

### 6. Зависимости только в apps/web

Все UI-зависимости объявляются явно в `apps/web/package.json`. В pnpm catalog не добавляются, пока их не использует второе приложение.

Ожидаемые прямые зависимости (точный список определяет CLI init):

- `tailwindcss`, `@tailwindcss/postcss`
- `shadcn`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`
- `@base-ui-components/react` (и связанные Base UI packages)
- `next-themes`

### 7. Тестирование

- Обновить `page.spec.tsx`: проверять heading «Lite Notion», наличие textbox и button через RTL accessible queries.
- Добавить тесты проектных Button и Input: потребительский `className` объединяется с проектными
  классами, а поддерживаемые props передаются vendor-компоненту.
- Smoke-form может иметь отдельный co-located spec при необходимости.
- После реализации выполнить `pnpm lint`, `pnpm --filter @lite-notion/web typecheck`, `test`, `build`.

## Risks / Trade-offs

- [CLI `shadcn add --overwrite` затирает файлы в `shared/ui/shadcn/`] → Хранить проектные стили и
  значения по умолчанию в одноимённых обёртках `shared/ui/*.tsx`; документировать vendor zone и не
  редактировать shadcn-файлы вручную.
- [Hydration mismatch с next-themes] → `suppressHydrationWarning` на `<html>`; стандартная практика shadcn.
- [Input может потянуть label] → Принять как допустимую транзитивную зависимость CLI; реэкспортировать label из barrel при необходимости.
- [Vitest не проверяет visual Tailwind styling] → Тесты проверяют DOM и a11y; visual smoke — через dev/build.

## Migration Plan

Изменение аддитивное:

1. Установить зависимости и PostCSS.
2. Запустить shadcn init/add.
3. Добавить shared-слой, проектные UI-обёртки, ThemeProvider и smoke UI.
4. Обновить layout, page, tests, AGENTS.md.
5. Прогнать корневые проверки и CI job `web`.

Откат — revert PR; миграция данных не требуется.
