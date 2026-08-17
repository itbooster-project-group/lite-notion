## Why

Frontend-приложение сознательно запущено без UI-стека: Tailwind, shadcn/ui и FSD отложены до появления интерфейса. Сейчас нужна согласованная основа для дальнейшей продуктовой разработки — с Tailwind CSS, shadcn/ui на Base UI в стиле Mira, class-based тёмной темой и структурой каталогов, совместимой с Feature Sliced Design.

## What Changes

- Установить Tailwind CSS v4 и PostCSS в `apps/web`.
- Инициализировать shadcn/ui с Base UI, стилем Mira и `baseColor: neutral`.
- Разместить CLI-managed компоненты shadcn в `src/shared/ui/shadcn/`, а кастомизируемые
  компоненты-обёртки — в `src/shared/ui/`; публичный API UI — через `@/shared/ui`.
- Изолировать проектные стили от обновлений shadcn CLI: прикладной код использует обёртки, а
  vendor-компоненты можно безопасно добавлять и перезаписывать через CLI.
- Добавить `next-themes` и class-based тёмную тему в корневой layout.
- Установить минимальный набор компонентов: `button`, `input` (и `label`, если потребует CLI).
- Обновить homepage smoke-test с Button и Input.
- Обновить `apps/web/AGENTS.md`: снять запрет на Tailwind/shadcn и зафиксировать правила FSD/vendor zone.
- Добавить и обновить тесты, подтверждающие рендер smoke UI.

## Capabilities

### New Capabilities

- `web-ui-foundation`: базовая UI-инфраструктура web-приложения — Tailwind, shadcn/Base UI (Mira), class-based dark mode и минимальный smoke UI на главной странице.

### Modified Capabilities

Нет.

## Impact

- **Frontend (`apps/web`):** новые зависимости, `components.json`, PostCSS, переработанный `globals.css`, слой `shared/` (lib, ui), ThemeProvider, vendor-компоненты shadcn, кастомизируемые UI-обёртки, обновлённые `layout.tsx`, `page.tsx` и тесты.
- **Backend:** не затрагивается.
- **Инфраструктура:** обновление `pnpm-lock.yaml`; CI job `web` должен проходить typecheck, test и build.
- **Документация:** обновление `apps/web/AGENTS.md`.

## Out of Scope

- Shared package `packages/ui` и monorepo UI workspace.
- FSD-слои `entities`, `features`, `widgets`.
- UI переключателя темы (toggle).
- TanStack Query, Zustand, React Hook Form, Zod.
- Продуктовые экраны и бизнес-компоненты beyond smoke-test.
- Глубокая модификация CLI-managed компонентов shadcn; проектные стили добавляются только в
  обёртках и через CSS variables.
