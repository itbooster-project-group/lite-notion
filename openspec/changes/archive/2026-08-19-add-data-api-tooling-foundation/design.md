## Context

См. `proposal.md` — Why. Сейчас NestJS публикует versioned health и непроизводственный Swagger JSON, но API не имеет внешних providers. Web не имеет server-state provider или HTTP client. Package scripts запускаются с working directory соответствующего приложения, API уже загружает `apps/api/.env`, а generated output должен оставаться воспроизводимым в чистом CI checkout.

## Goals / Non-Goals

**Goals:**

- Создать минимальную database boundary, пригодную для будущих application modules без преждевременной продуктовой схемы.
- Предоставить database-aware health endpoint с предсказуемым контрактом успеха и ошибки.
- Сделать Nest OpenAPI единственным источником типов и mock handlers web.
- Покрыть database boundary, health contract и generated API изолированными детерминированными тестами.

**Non-Goals:**

- Не создавать Prisma models, migrations или seed data до появления первой продуктовой сущности.
- Не переносить API/web в Compose и не проектировать production orchestration.
- Не добавлять UI-индикатор health, SSR prefetch, auth headers или общую retry/cache policy.
- Не добавлять Redis, BullMQ, Socket.IO или authorization.

## Decisions

### PostgreSQL остаётся единственным Compose service

`./apps/api/docker-compose.yaml` использует официальный `postgres:18-alpine`, development-only credentials, порт `5432`, именованный volume и `pg_isready`. Корневой `pnpm dev` сначала выполняет `db:up`, дожидается healthy PostgreSQL и только затем запускает API и web на host для быстрого watch/HMR. Для раздельной разработки корневой `pnpm dev:web` запускает только web без управления Compose, а `pnpm dev:api` сначала поднимает healthy PostgreSQL и затем запускает API. Низкоуровневые scoped-команды приложений по-прежнему не управляют Compose.

Отдельные команды `db:up` и `db:down` сохраняются для явного управления базой. Остановка watch-процессов `pnpm dev` или `pnpm dev:api` не останавливает PostgreSQL: service продолжает работать для следующих запусков, а `db:down` выключает его без удаления именованного volume.

### Prisma 7 использует pg driver adapter и generated client вне git

`apps/api/prisma.config.ts` загружает локальный env и задаёт PostgreSQL datasource; `schema.prisma` содержит `prisma-client` generator с custom output в `src/generated/prisma`, явным `moduleFormat = "cjs"` и пока не содержит models. CommonJS закреплён явно, потому что текущий Nest build компилирует API в CommonJS, а автоматический ESM inference Prisma создаёт несовместимое сочетание `exports` и `import.meta.url` в Node 22 runtime. `@prisma/adapter-pg` получает URL и ограниченный connection timeout из типизированного application config. Generated client игнорируется git и создаётся явной командой, а также перед API OpenAPI generation/test/typecheck/build.

`DatabaseModule` экспортирует `PrismaService`. Service не вызывает `$connect()` при module init: первый query открывает pool лениво, поэтому временно недоступная база не препятствует запуску процесса API. `onModuleDestroy` вызывает `$disconnect()`.

### Health оркестрируется вне controller

`HealthController` остаётся transport-only. `HealthService` вызывает компактный `PrismaService.checkConnection()` с `SELECT 1`, преобразует любую database failure в `ServiceUnavailableException("Database is unavailable")` и не передаёт исходную ошибку клиенту. Успех возвращает `{ status: "ok", database: "up" }`; общий exception filter формирует стандартизированный `503` с timestamp/path.

`GET /api/v1/health` сохраняет operation ID `getHealth` и документирует ответы `200` и `503`. Авторизация не добавляется: endpoint не содержит данных или секретов.

### Snapshot создаётся из той же Swagger factory без HTTP и БД

Создание Swagger document выделяется в переиспользуемую функцию. API script собирает `AppModule`, получает типизированный config через обычный `ConfigModule`, применяет prefix/global configuration, создаёт document из metadata и записывает стабильный `apps/api/openapi.json`, не вызывая listen и database query. Локальный запуск использует документированный `apps/api/.env`, а CI передаёт environment явно. Development `/api/openapi.json` использует ту же factory; production route остаётся отсутствующим.

Snapshot и web generated output коммитятся. Root contract command последовательно обновляет snapshot и Orval output; CI выполняет эту команду и `git diff --exit-code` для обнаружения drift.

### Orval генерирует React Query/fetch и только MSW mocks

`apps/web/orval.config.ts` читает `../api/openapi.json`, использует `tags-split`, `react-query` и fetch mutator. Mutator добавляет runtime base URL `NEXT_PUBLIC_API_BASE_URL` с локальным fallback `http://localhost:3001`, возвращает типизированные success data и бросает типизированную ошибку для неуспешных responses. MSW generator использует OpenAPI examples, нулевую задержку и общий mock barrel.

Generated code размещается в `src/shared/api/generated`; ручная инфраструктура — рядом в `shared/api` и существующем `_app/providers`. `AppProviders` дополняет имеющийся `ThemeProvider`, создаёт стабильный `QueryClient` на browser lifetime и подключается через public API из root layout. Tailwind globals, font configuration, shared UI и содержимое стартовой страницы сохраняются из базовой web-архитектуры; generated Orval output исключается из Steiger и форматируется общей Biome-конфигурацией.

### MSW использует один generated handler set

Vitest `setupServer` запускается до suites, сбрасывает overrides после каждого теста, закрывается после всех тестов и считает необработанный API-запрос ошибкой. Browser `setupWorker` импортируется только в development при `NEXT_PUBLIC_API_MOCKING=enabled`; provider ждёт завершения `worker.start()` до монтирования query consumers. В production и при выключенном флаге worker module не запускается. `public/mockServiceWorker.js` создаётся официальной MSW CLI и коммитится.

### Тестовый контур изолирует внешние зависимости

`pnpm test` использует mocked providers и MSW. API test environment задаётся декларативно через `test.env` в Vitest config, а setup-файл подключает `reflect-metadata`. `PrismaService.checkConnection()` проверяется unit-тестом через mock `$queryRaw`, а health success/failure — через mocked database provider. Реальное состояние соединения доступно при запущенном приложении через `GET /api/v1/health`.

## Risks / Trade-offs

- **Пустая Prisma schema не создаёт migration history** → первая продуктовая change создаст первую осмысленную migration вместе с model.
- **Committed generated files могут устареть** → CI регенерирует snapshot/client/mocks и отклоняет drift.
- **Browser worker может перехватить неожиданный development traffic** → он выключен по умолчанию и активируется только точным публичным флагом.
- **Generated code может конфликтовать с formatter** → contract generation завершает форматированием generated paths через root-owned Biome.

## Migration Plan

1. Добавить Compose/env/Prisma boundary и unit-проверки без product schema.
2. Добавить database-aware health contract и обновить Swagger factory/tests.
3. Создать initial snapshot, Orval output, Query/MSW runtime и web tests.
4. Подключить scripts, CI drift check и README, затем выполнить полный root check set и строгую OpenSpec-валидацию.
5. Закрепить CommonJS format Prisma Client и проверить загрузку скомпилированного клиента и реальный Nest development startup.

Rollback выполняется откатом change целиком. Локальный volume можно сохранить для повторного применения; удаление данных не входит в автоматический rollback.
