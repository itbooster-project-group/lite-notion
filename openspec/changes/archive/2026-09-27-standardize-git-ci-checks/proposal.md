## Why

Git hooks запускают тяжёлые проверки не на подходящем этапе, а CI не покрывает одинаково PR и прямые push в `main`. Нужно распределить проверки по скорости и назначению: быстрые staged checks при commit, полный локальный gate перед push и обязательные app checks в CI.

## What Changes

- Оставить в `pre-commit` только `pnpm exec lint-staged`.
- Убрать build из `pre-push`, сохранив lint, typecheck, workspace unit tests, Steiger и `api:check`.
- Сохранить отдельную команду `pnpm test:dev-lan`, а `pnpm test` оставить для recursive workspace tests без `test:dev-lan`.
- Запускать CI для PR в `main` и push в `main`, сохранив jobs `lint`, `web`, `api`, `collaboration`.
- Перенести `pnpm dedupe --check` из `web` job в `lint` job и оставить эту проверку только в CI; явно не включать `dev-lan`, Playwright E2E и integration tests в обязательные CI checks.
- Сохранить build обязательным в CI для каждого приложения.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. Изменение касается только локального developer tooling и автоматизации CI, не меняя продуктовые требования; для change включён `skip_specs: true`.

## Impact

- `.husky/pre-commit`, `.husky/pre-push` и корневой `package.json`.
- `.github/workflows/ci.yml`.
- Продуктовый код, семантика тестов, зависимости и публичные API не затрагиваются.
