## Why

Проекту нужен воспроизводимый контур работы с данными и HTTP-контрактом: сейчас API не умеет подключаться к PostgreSQL, frontend не имеет типизированного клиента, а тесты и автономная frontend-разработка не могут переиспользовать OpenAPI-контракт. Добавление единого технического фундамента сейчас предотвратит появление несогласованных ручных клиентов и способов доступа к базе при реализации первых продуктовых сущностей.

## What Changes

- Добавить локальный PostgreSQL в Docker Compose с постоянным volume и healthcheck, не контейнеризируя web и API.
- Подключить Prisma к NestJS через отдельную инфраструктурную границу, валидируемую конфигурацию и ленивое соединение.
- **BREAKING** Расширить `GET /api/v1/health` проверкой PostgreSQL; успешный ответ содержит top-level database status, а ошибка возвращает безопасный `503`.
- Генерировать коммитируемый OpenAPI snapshot из Nest metadata и проверять его drift в CI.
- Генерировать для web типизированные TanStack Query hooks и детерминированные MSW handlers через Orval.
- Настроить QueryClient provider, MSW для Vitest и опциональный browser worker для development.
- Добавить команды разработки и русскоязычную документацию.
- Вне scope: продуктовые модели и миграции, CRUD, Redis, очереди, realtime, auth, контейнеризация приложений и production deployment.

## Capabilities

### New Capabilities

- `database-runtime-foundation`: Локальный PostgreSQL, Prisma lifecycle и наблюдаемая health-проверка базы данных.
- `generated-api-consumption`: Воспроизводимый OpenAPI snapshot, типизированный TanStack Query client и единые MSW mocks для тестов и development.

### Modified Capabilities

- `api-runtime-foundation`: Расширить обязательную конфигурацию базы данных и OpenAPI-контракт единого health endpoint, сохранив production-ограничения Swagger.

## Impact

- **Frontend:** `apps/web` получает TanStack Query, Orval-generated API слой, MSW test/browser setup и публичную конфигурацию API URL и mocking flag.
- **Backend:** `apps/api` получает Prisma/PostgreSQL dependencies, database module, database-aware health behavior, дополнительные env contracts и генератор OpenAPI snapshot.
- **Infrastructure:** в корне появляются локальный Docker Compose workflow, команды data/API codegen и CI-проверка generated contract drift.
- **Публичный API:** `GET /api/v1/health` возвращает `{ "status": "ok", "database": "up" }` либо безопасный `503`.
- **Артефакты:** OpenAPI snapshot и Orval output коммитятся; Prisma Client генерируется локально/в CI и не коммитится.
