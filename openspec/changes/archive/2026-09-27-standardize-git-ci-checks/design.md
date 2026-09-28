## Context

Сейчас `pre-commit` запускает `lint-staged` и полный `pnpm test`; `pre-push` запускает lint, typecheck, build, tests и Steiger. Root `pnpm test` сначала запускает `test:dev-lan`, затем Vitest во всех workspace-приложениях. CI имеет отдельные jobs `lint`, `web`, `api`, `collaboration`, запускается только на PR в `main`; `dev-lan` в CI напрямую не вызывается.

## Goals / Non-Goals

**Goals:**

- Разнести быстрые staged checks, локальные pre-push checks и обязательные CI checks.
- Избежать повторного запуска одного набора тестов в одном gate.
- Проверять одинаковый CI workflow на pull request и push в `main`.

**Non-Goals:**

- Менять приложения, тестовую семантику, CI job breakdown или обязательные статус-check names.
- Добавлять Playwright E2E либо API/Collaboration integration tests в обязательные проверки.
- Запускать локальные `dev-lan` tests в CI или pre-push.

## Decisions

- **Pre-commit:** оставить только `pnpm exec lint-staged`; полный test suite не запускать на каждый commit.
- **Pre-push:** запускать `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm steiger`, `pnpm api:check`; build не запускать. Root `pnpm test` запускает только recursive workspace tests, без `test:dev-lan`.
- **dev-lan command:** оставить `pnpm test:dev-lan` самостоятельной ручной командой, исключить её из root `pnpm test` и всех обязательных hooks/CI.
- **CI structure:** сохранить четыре текущих job ids. `lint` выполняет установку, `pnpm dedupe --check` и `pnpm lint`; проверки Web, API и Collaboration остаются в их app jobs. Повторять `pnpm install --frozen-lockfile` в каждом job, как сейчас.
- **CI triggers/concurrency:** сохранить `pull_request.types` (`opened`, `synchronize`, `reopened`), добавить `push.branches: [main]`. В concurrency key использовать номер PR для PR и ref для push, чтобы выражение работало для обоих событий.
- **CI tests:** запускать только app-specific unit test commands в app jobs; не запускать root `pnpm test`, чтобы dev-lan не попал косвенно и тесты приложений не дублировались. Build остаётся обязательным для Web, API и Collaboration.
- **dev-lan CI placement:** отдельный CI job не добавлять; проверка не является частью обязательного gate, её команда остаётся доступна для локального запуска.

## Risks / Trade-offs

- [Root `pnpm test` изменит охват] → выделить локальные tooling tests в уже существующую `pnpm test:dev-lan`; выполнять root test script и app-specific test commands при проверке отсутствия дублей.
- [Push и PR имеют разные event payloads] → использовать fallback между `github.event.pull_request.number` и `github.ref` в concurrency group.
- [Без build в pre-push часть ошибок обнаружится только в CI] → сохранить build обязательным в каждом соответствующем CI job.

## Migration Plan

Изменение ограничено hook commands, root scripts и workflow. Откат — вернуть прежние команды в hooks/root manifest и исходные CI triggers/steps; миграции данных и новые зависимости не требуются.
