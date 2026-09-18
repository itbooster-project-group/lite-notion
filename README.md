# Lite Notion

Базовый монорепозиторий приложения для совместных заметок, документации и управления проектами.

На текущем этапе репозиторий содержит техническую основу:

- `apps/web` — Next.js-приложение;
- `apps/api` — NestJS API;
- `apps/collaboration` — самостоятельный Hocuspocus/WebSocket runtime для Yjs-синхронизации;
- `apps/gateway` — Envoy gateway для единого HTTP/WebSocket entrypoint;
- PostgreSQL 18 в Docker Compose и Prisma для доступа к данным;
- OpenAPI-driven TanStack Query client и MSW mocks для frontend;
- общие команды pnpm, TypeScript, Biome и Vitest;
- OpenSpec для планирования изменений.

Продуктовые функции и Redis пока не реализованы. Из прикладной функциональности доступны email-регистрация и session-backed аутентификация: Prisma-модели `User` и `Session` с миграцией и маршруты под `/api/v1/auth`.

## Требования

- Node.js 22;
- Corepack;
- pnpm 11.21.0.
- Docker с поддержкой команды `docker compose`.

Node.js 22 обычно поставляется с Corepack. Если команда `corepack` недоступна с ошибкой `corepack: command not found`, установите Corepack глобально:

```bash
npm install -g corepack
```

Версия pnpm зафиксирована в поле `packageManager` корневого `package.json`. Перед первой установкой зависимостей активируйте Corepack:

```bash
corepack enable
corepack install -g pnpm@11.21.0
```

## Установка

```bash
pnpm install
```

## Запуск для разработки

Перед локальным запуском создайте конфигурацию приложений из шаблонов:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/collaboration/.env.example apps/collaboration/.env
cp apps/web/.env.example apps/web/.env.local
```

Запустите полное окружение разработки:

```bash
pnpm dev
```

Команда поднимает PostgreSQL, Redis и gateway, дожидается healthcheck и затем одновременно запускает:

- frontend через gateway: [http://localhost:8080](http://localhost:8080);
- gateway: [http://localhost:8080](http://localhost:8080) — основной адрес приложения;
- API через gateway: [http://localhost:8080/api/v1/health](http://localhost:8080/api/v1/health);
- collaboration через gateway: ws://localhost:8080/collaboration;
- Swagger UI через gateway: [http://localhost:8080/api/docs](http://localhost:8080/api/docs);
- OpenAPI JSON через gateway: [http://localhost:8080/api/openapi.json](http://localhost:8080/api/openapi.json).

Внутренние процессы по-прежнему слушают `3000` (web), `3001` (API) и `3002` (collaboration), но клиентам следует использовать gateway на `8080`.

Для проверки с телефона, планшета или другого компьютера в той же сети запустите LAN-режим:

```bash
pnpm dev:lan
```

Команда определит private LAN IPv4, поднимет PostgreSQL и gateway, запустит web, API и collaboration за gateway и выведет единый адрес приложения вида `http://<IP>:8080`. API доступен по `/api/v1`, а WebSocket — по `/collaboration`; browser API mocking отключается через `NEXT_PUBLIC_API_MOCKING=disabled`. Устройства должны быть в одной сети; операционная система может показать firewall prompt для входящих соединений.

Если адрес нужно выбрать вручную, передайте client-usable IPv4 явно:

```bash
LAN_HOST=<IP> pnpm dev:lan
```

Проверить API можно из терминала:

```bash
curl http://localhost:8080/api/v1/health
```

Ожидаемый ответ:

```json
{"status":"ok","database":"up"}
```

API использует следующие переменные окружения:

| Переменная | Значение в `.env.example` | Ограничения |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` или `production` |
| `PORT` | `3001` | Целое число от 1 до 65535 |
| `CORS_ORIGIN` | `http://localhost:8080` | Один точный HTTP(S) origin без path, query и fragment |
| `DATABASE_URL` | local Compose URL | PostgreSQL URL с protocol `postgresql` или `postgres` |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Целое число от 1 до 60000 |
| `JWT_SECRET` | `local-development-only-change-me-before-deploy` | Строка длиной не менее 32 символов; уникальное значение для каждого окружения |
| `ACCESS_TOKEN_TTL_S` | `900` | Целое число от 60 до 3600 |
| `REFRESH_TOKEN_TTL_S` | `2592000` | Целое число от 3600 до 7776000 и строго больше `ACCESS_TOKEN_TTL_S` |
| `BCRYPT_ROUNDS` | `12` | Целое число от 4 до 15 |

Все API-переменные обязательны в runtime. Prisma CLI использует URL локального Compose как development fallback, если `DATABASE_URL` не передан процессу.

Frontend использует следующие публичные переменные:

| Переменная | Значение в `.env.example` | Назначение |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | Origin gateway для generated fetch client |
| `NEXT_PUBLIC_COLLABORATION_URL` | `ws://localhost:8080/collaboration` | Gateway WebSocket URL для Yjs document transport |
| `NEXT_PUBLIC_API_MOCKING` | `disabled` | Значение `enabled` включает MSW browser worker только в development |

Collaboration runtime использует следующие переменные окружения:

| Переменная | Значение в `.env.example` | Ограничения |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test` или `production` |
| `PORT` | `3002` | Целое число от 1 до 65535 |
| `COLLABORATION_ALLOWED_ORIGIN` | `http://localhost:8080` | Один точный HTTP(S) origin frontend без path, query и fragment |
| `DATABASE_URL` | local Compose URL | PostgreSQL URL с protocol `postgresql` или `postgres` |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `5000` | Целое число от 1 до 60000 |
| `JWT_SECRET` | `local-development-only-change-me-before-deploy` | Тот же secret, которым API подписывает access JWT; строка длиной не менее 32 символов |
| `WEBSOCKET_MAX_PAYLOAD_BYTES` | `1048576` | Положительное целое число для одного WebSocket payload; не ограничивает итоговый Yjs-документ |

Collaboration service используется frontend-редактором для document content через Yjs. Backend `PUT /api/v1/pages/:pageId/document` пока сохраняется без изменений как compatibility path для legacy clients, но migrated web editor его не вызывает и не использует как fallback. Удаление backend REST writer запланировано отдельным change после end-to-end проверки collaboration.

### Автономная разработка frontend

Для работы над frontend без API, PostgreSQL и Docker достаточно создать только web-конфигурацию:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Включите browser mocks в `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_API_MOCKING=enabled
```

Запустите только Next.js-приложение:

```bash
pnpm dev:web
```

Frontend будет доступен на [http://localhost:3000](http://localhost:3000). MSW перехватывает запросы, для которых существуют generated handlers; необработанные запросы пропускаются к `NEXT_PUBLIC_API_BASE_URL` (для полного окружения используйте gateway на `http://localhost:8080`).

Для отдельной разработки backend запустите API вместе с PostgreSQL:

```bash
pnpm dev:api
```

Команда поднимает PostgreSQL, дожидается его healthcheck и запускает NestJS в watch mode. После создания `.env` порт API можно переопределить:

```bash
PORT=4000 pnpm dev:api
```

Для отдельной разработки collaboration runtime запустите:

```bash
pnpm dev:collaboration
```

Команда поднимает PostgreSQL или подтверждает его готовность, затем запускает только `apps/collaboration` без web/API.

### E2E collaboration

Collaboration E2E-тесты находятся в `apps/web/e2e/page-editor-collaboration.spec.ts` и используют gateway на `http://localhost:8080`. Перед запуском:

1. Запустите полное окружение:

   ```bash
   pnpm dev:lan
   ```

2. Создайте локальную конфигурацию E2E:

   ```bash
   cp apps/web/.env.e2e.example apps/web/.env.e2e
   ```

3. Укажите в `apps/web/.env.e2e` ID существующей страницы из URL вида `http://localhost:8080/pages/<PAGE_ID>`, а также email и пароль одного или двух заранее созданных тестовых пользователей.
4. Запустите тесты — Playwright автоматически загрузит `apps/web/.env.e2e`:

   ```bash
   pnpm --filter @lite-notion/web test:e2e -- e2e/page-editor-collaboration.spec.ts
   ```

Каждый браузерный контекст авторизуется через форму входа по `PLAYWRIGHT_USER_A_EMAIL` и `PLAYWRIGHT_USER_A_PASSWORD` либо по соответствующим переменным пользователя B. Сценарии с двумя пользователями и presence дополнительно требуют `PLAYWRIGHT_USER_A_ID`, `PLAYWRIGHT_USER_A_NAME`, `PLAYWRIGHT_USER_B_ID` и `PLAYWRIGHT_USER_B_NAME`; сценарий переключения страницы также требует `PLAYWRIGHT_SECOND_PAGE_ID`. Тестовые пользователи и страницы нужно подготовить вручную: отдельного скрипта подготовки E2E-окружения в репозитории нет.

Все прикладные маршруты API находятся под prefix `/api/v1`. `GET /api/v1/health` проверяет доступность API и PostgreSQL, возвращая безопасный `503`, если база недоступна. Swagger UI и OpenAPI JSON доступны только при `NODE_ENV`, отличном от `production`; YAML-схема не публикуется.

## Prisma и API-контракт

Каталога `packages/` в актуальной структуре проекта нет: workspace состоит только из приложений в `apps/*`. Текущая Prisma schema находится в `apps/api/prisma/schema.prisma` и содержит модели `User`, `Session`, `Project`, `Page` и `PageDocument`. Основные команды:

```bash
pnpm --filter @lite-notion/api prisma:generate
pnpm --filter @lite-notion/api db:migrate:dev
pnpm --filter @lite-notion/api db:studio
```

`db:migrate:dev` создаёт новую миграцию после изменения Prisma schema и применяет все неприменённые миграции к локальной базе. Если именованный PostgreSQL volume был создан до появления текущей истории миграций либо Prisma сообщает о schema drift или непустой схеме без migration history, пересоздайте локальную базу:

```bash
pnpm --filter @lite-notion/api exec prisma migrate reset
```

Команда `migrate reset` удаляет все данные из локальной базы, заново создаёт схему и применяет все миграции. Используйте её только для локальной разработки. В CI и production применяйте уже созданные миграции без сброса данных:

```bash
pnpm --filter @lite-notion/api db:migrate:deploy
```

После изменения Swagger decorators или DTO обновите коммитируемый OpenAPI snapshot, TanStack Query hooks и MSW handlers:

```bash
pnpm api:generate
```

`pnpm api:check` выполняет ту же генерацию и завершается ошибкой при незакоммиченном drift.

После остановки `pnpm dev` или `pnpm dev:api` PostgreSQL продолжает работать для следующих запусков. Остановить локальную базу без удаления именованного volume можно явно:

```bash
pnpm db:down
```

## Команды

| Команда | Назначение |
| --- | --- |
| `pnpm dev` | Поднять PostgreSQL, дождаться healthcheck и запустить frontend, API и collaboration runtime в watch mode |
| `pnpm dev:lan` | Поднять development окружение для устройств в той же сети; при необходимости адрес задаётся через `LAN_HOST=<IP>` |
| `pnpm dev:web` | Запустить только frontend без API и Docker; API mocking определяется web environment |
| `pnpm dev:api` | Поднять PostgreSQL, дождаться healthcheck и запустить API в watch mode |
| `pnpm dev:collaboration` | Поднять PostgreSQL или проверить его готовность и запустить только collaboration runtime |
| `pnpm db:up` | Поднять локальный PostgreSQL и дождаться healthcheck |
| `pnpm db:down` | Остановить Compose services без удаления database volume |
| `pnpm api:generate` | Обновить OpenAPI snapshot, web client и MSW handlers |
| `pnpm api:check` | Проверить generated API artifacts на drift |
| `pnpm build` | Собрать все workspace applications и packages |
| `pnpm lint` | Проверить workspace через Biome без изменения файлов |
| `pnpm format` | Отформатировать файлы и применить безопасные исправления Biome |
| `pnpm typecheck` | Проверить типы обоих приложений |
| `pnpm test` | Запустить все тесты через Vitest |

## Структура

```text
.
├── apps
│   ├── api
│   ├── collaboration
│   ├── gateway
│   └── web
├── openspec
├── biome.json
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## OpenSpec

OpenSpec уже инициализирован в каталоге `openspec`. Участникам, которые планируют разработку с coding agents, нужна совместимая версия CLI:

```bash
npm install -g @fission-ai/openspec@1.7.0
openspec --version
```

Не запускайте `openspec init` повторно. Активные изменения можно посмотреть командой:

```bash
openspec list
```

Краткая последовательность работы:

1. Создать OpenSpec change и провести human review planning artifacts.
2. Реализовать утверждённые задачи с агентом и выполнить проверки.
3. Открыть Pull Request и получить human review реализации.
4. Архивировать change в том же PR, получить финальное approval и выполнить merge.

Команды для Codex, Claude Code, Cursor и OpenCode, критерии перехода между этапами и правила синхронизации specs описаны в [гайде по OpenSpec workflow](docs/openspec-workflow.md).
