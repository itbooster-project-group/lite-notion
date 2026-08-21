## 1. PostgreSQL и Prisma setup

- [x] 1.1 Добавить корневой `compose.yaml`, команды `db:up`/`db:down`, постоянный PostgreSQL volume и healthcheck.
- [x] 1.2 Подключить Prisma/PostgreSQL dependencies и scripts в API, создать `prisma.config.ts`, model-free `schema.prisma` и правило игнорирования generated client.
- [x] 1.3 Расширить API env contract переменными `DATABASE_URL` и `DATABASE_CONNECTION_TIMEOUT_MS`, обновить env template и unit-тесты конфигурации.
- [x] 1.4 Реализовать экспортируемый `DatabaseModule` и ленивый `PrismaService` с connection check и shutdown cleanup.

## 2. Health и OpenAPI contract

- [x] 2.1 Добавить `HealthService`, transport-only database-aware health route и именованные DTO для успешных и `503` responses.
- [x] 2.2 Добавить unit/HTTP tests для health success/failure и безопасного error contract.
- [x] 2.3 Выделить переиспользуемую Swagger document factory, закрепить operation IDs и добавить offline OpenAPI snapshot generator с предварительной генерацией Prisma Client и тестами контракта.

## 3. Generated frontend API

- [x] 3.1 Подключить TanStack Query, Orval и MSW в web и настроить generation React Query/fetch client и deterministic MSW handlers из API snapshot.
- [x] 3.2 Дополнить существующую композицию web providers стабильным QueryClient, добавить runtime API base URL и подключить её через public API к App Router layout без изменения theme, styles и содержимого страницы.
- [x] 3.3 Настроить общий MSW handler set для Vitest и опционального development browser worker с выключенным по умолчанию flag.
- [x] 3.4 Добавить web-тест generated health hook через QueryClient и MSW, включая error override и запрет необработанных запросов.

## 4. CI и документация

- [x] 4.1 Добавить root contract generation/check scripts и generated drift check в CI.
- [x] 4.2 Обновить README и scoped AGENTS guidance для Compose, Prisma, health, codegen, Query и MSW workflows.

## 5. Проверка

- [x] 5.1 Сгенерировать и проверить Prisma Client, OpenAPI snapshot, Orval client/mocks и MSW worker asset.
- [x] 5.2 Выполнить Compose config check, полный root lint/typecheck/test/build и `openspec validate add-data-api-tooling-foundation --strict`.

## 6. Prisma Client module format

- [x] 6.1 Закрепить `moduleFormat = "cjs"` в Prisma generator, перегенерировать client и проверить его загрузку в server runtime.
- [x] 6.2 Выполнить API typecheck/unit/build, загрузку compiled Prisma Client, реальный `pnpm dev` startup, root lint и строгую OpenSpec-валидацию.

## 7. Body-only типизация generated client

- [x] 7.1 Согласовать Orval fetch return types с body-only `apiFetch`, добавить compile-time regression test, перегенерировать client и проверить query/mutation через MSW.

## 8. Единый локальный dev workflow

- [x] 8.1 Сделать корневой `pnpm dev` самодостаточным: поднять и дождаться healthy PostgreSQL перед запуском web/API, сохранив отдельные `db:up`/`db:down` и Docker-независимые scoped-команды приложений; обновить README и корневой AGENTS guidance.
- [x] 8.2 Проверить Compose config, полный root dev startup, автономный frontend startup, полный root check set и строгую OpenSpec-валидацию.

## 9. Раздельные root dev-команды

- [x] 9.1 Добавить корневые `dev:web` и `dev:api`: frontend запускается без Docker, backend — после запуска и healthcheck PostgreSQL; обновить README и корневой AGENTS guidance.
- [x] 9.2 Проверить оба раздельных startup workflow, lifecycle PostgreSQL, полный root check set и строгую OpenSpec-валидацию.
