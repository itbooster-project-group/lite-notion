## Why

В веб-приложении одновременно используются `lucide-react` и Hugeicons, из-за чего растёт набор зависимостей и появляются разные визуальные стили иконок. Нужно привести UI к одному источнику иконок, так как Lucide уже используется в проекте и соответствует ожидаемой shadcn-конфигурации.

## What Changes

- Все иконки в `apps/web` переводятся на компоненты из `lucide-react`.
- Импорты `@hugeicons/core-free-icons` и `@hugeicons/react` удаляются из исходного кода.
- Текстовые псевдоиконки в деревьях страниц заменяются на Lucide-компоненты.
- `apps/web/components.json` переключается на `iconLibrary: "lucide"` без смены стиля shadcn.
- Зависимости Hugeicons удаляются из `apps/web/package.json` и `pnpm-lock.yaml`.
- В `apps/web/AGENTS.md` закрепляется правило использовать Lucide для UI-иконок.

Вне scope: изменение продуктового поведения, маршрутов, API, OpenAPI-схемы, backend-кода и визуальной темы приложения.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. Изменение является UI/refactor-работой без изменения требований к поведению, поэтому для change включён `skip_specs: true`.

## Impact

- Frontend: компоненты навигации, дерева страниц, меню и кнопки выхода.
- Dependencies: удаление `@hugeicons/core-free-icons` и `@hugeicons/react` из web-приложения.
- Configuration: shadcn `components.json` переводится на Lucide.
- Backend and infrastructure: не затрагиваются.
