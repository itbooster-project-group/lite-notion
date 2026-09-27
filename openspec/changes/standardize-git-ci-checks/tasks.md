## 1. Git hooks и root scripts

- [x] 1.1 Оставить в `.husky/pre-commit` только `pnpm exec lint-staged`.
- [x] 1.2 Обновить `.husky/pre-push`: оставить lint, typecheck, `pnpm test`, Steiger и `api:check`, убрать build.
- [x] 1.3 Оставить `pnpm test:dev-lan` отдельной командой, убрать её из `pnpm test`, чтобы root test script запускал только recursive workspace tests.

## 2. GitHub Actions CI

- [x] 2.1 Добавить trigger `push` в `main`, сохранить текущие `pull_request.types` и сделать concurrency group event-safe.
- [x] 2.2 Сохранить jobs `lint`, `web`, `api`, `collaboration` и frozen-lockfile install в каждом job; перенести `pnpm dedupe --check` из `web` в `lint` job и оставить эту проверку только в CI.
- [x] 2.3 Убедиться, что Web job выполняет typecheck, unit tests, build и Steiger; API job — Prisma generate, `api:check`, typecheck, unit tests и build.
- [x] 2.4 Сохранить PostgreSQL service и migration preparation в Collaboration job перед typecheck, unit tests и build.
- [x] 2.5 Не добавлять `dev-lan`, Playwright E2E или API/Collaboration integration tests в обязательный CI.

## 3. Проверки

- [x] 3.1 Проверить назначение root scripts: `pnpm test` запускает workspace test suites ровно один раз, `pnpm test:dev-lan` запускается отдельно.
- [x] 3.2 Выполнить `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:dev-lan`, `pnpm steiger`, `pnpm api:check`, `pnpm dedupe --check` и `pnpm build`.
- [x] 3.3 Проверить workflow YAML, выполнить `openspec validate standardize-git-ci-checks --strict` и `git diff --check`.
