# Lite Notion

Базовый монорепозиторий приложения для совместных заметок, документации и управления проектами.

На текущем этапе репозиторий содержит техническую основу:

- `apps/web` — Next.js-приложение;
- `apps/api` — NestJS API;
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
cp apps/web/.env.example apps/web/.env.local
```

Запустите полное окружение разработки:

```bash
pnpm dev
```

Команда поднимает PostgreSQL, дожидается его healthcheck и затем одновременно запускает:

- frontend: [http://localhost:3000](http://localhost:3000);
- API: [http://localhost:3001](http://localhost:3001);
- health endpoint: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health);
- Swagger UI: [http://localhost:3001/api/docs](http://localhost:3001/api/docs);
- OpenAPI JSON: [http://localhost:3001/api/openapi.json](http://localhost:3001/api/openapi.json).

Проверить API можно из терминала:

```bash
curl http://localhost:3001/api/v1/health
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
| `CORS_ORIGIN` | `http://localhost:3000` | Один точный HTTP(S) origin без path, query и fragment |
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
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Origin NestJS API для generated fetch client |
| `NEXT_PUBLIC_API_MOCKING` | `disabled` | Значение `enabled` включает MSW browser worker только в development |

### Автономная разработка frontend

Для работы над frontend без API, PostgreSQL и Docker достаточно создать только web-конфигурацию:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Включите browser mocks в `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_API_MOCKING=enabled
```

Запустите только Next.js-приложение:

```bash
pnpm dev:web
```

Frontend будет доступен на [http://localhost:3000](http://localhost:3000). MSW перехватывает запросы, для которых существуют generated handlers; необработанные запросы пропускаются к `NEXT_PUBLIC_API_BASE_URL`.

Для отдельной разработки backend запустите API вместе с PostgreSQL:

```bash
pnpm dev:api
```

Команда поднимает PostgreSQL, дожидается его healthcheck и запускает NestJS в watch mode. После создания `.env` порт API можно переопределить:

```bash
PORT=4000 pnpm dev:api
```

Все прикладные маршруты API находятся под prefix `/api/v1`. `GET /api/v1/health` проверяет доступность API и PostgreSQL, возвращая безопасный `503`, если база недоступна. Swagger UI и OpenAPI JSON доступны только при `NODE_ENV`, отличном от `production`; YAML-схема не публикуется.

## Prisma и API-контракт

Текущая Prisma schema пока не содержит продуктовых моделей. Основные команды:

```bash
pnpm --filter @lite-notion/api prisma:generate
pnpm --filter @lite-notion/api db:migrate:dev
pnpm --filter @lite-notion/api db:studio
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
| `pnpm dev` | Поднять PostgreSQL, дождаться healthcheck и запустить frontend и API в watch mode |
| `pnpm dev:web` | Запустить только frontend без API и Docker; API mocking определяется web environment |
| `pnpm dev:api` | Поднять PostgreSQL, дождаться healthcheck и запустить API в watch mode |
| `pnpm db:up` | Поднять локальный PostgreSQL и дождаться healthcheck |
| `pnpm db:down` | Остановить Compose services без удаления database volume |
| `pnpm api:generate` | Обновить OpenAPI snapshot, web client и MSW handlers |
| `pnpm api:check` | Проверить generated API artifacts на drift |
| `pnpm build` | Собрать оба приложения |
| `pnpm lint` | Проверить workspace через Biome без изменения файлов |
| `pnpm format` | Отформатировать файлы и применить безопасные исправления Biome |
| `pnpm typecheck` | Проверить типы обоих приложений |
| `pnpm test` | Запустить все тесты через Vitest |

## Структура

```text
.
├── apps
│   ├── api
│   └── web
├── openspec
├── biome.json
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Документация

- [План на MVP](docs/mvp-plan.md) — актуальный объём MVP, этапы и зависимости нового backlog.
- [Схемы экранов MVP](docs/mvp-screens.md) — схематичные интерфейсы продуктовых этапов.
- [Схема базы данных](docs/database-schema.md) — ER-диаграмма, модель Yjs-документов и ключевые архитектурные решения.
- [Гайд по OpenSpec workflow](docs/openspec-workflow.md) — процесс планирования, реализации и review изменений.

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
