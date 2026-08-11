# Lite Notion

Базовый монорепозиторий приложения для совместных заметок, документации и управления проектами.

На текущем этапе репозиторий содержит только техническую основу:

- `apps/web` — Next.js-приложение;
- `apps/api` — NestJS API;
- общие команды pnpm, TypeScript, Biome и Vitest;
- OpenSpec для планирования изменений.

Продуктовые функции, базы данных, Redis, Docker и авторизация пока не реализованы.

## Требования

- Node.js 22;
- Corepack;
- pnpm 11.21.0.

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

```bash
pnpm dev
```

Команда одновременно запускает:

- frontend: [http://localhost:3000](http://localhost:3000);
- API: [http://localhost:3001](http://localhost:3001);
- health endpoint: [http://localhost:3001/health](http://localhost:3001/health).

Проверить API можно из терминала:

```bash
curl http://localhost:3001/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
```

Порт API можно переопределить переменной окружения `PORT`:

```bash
PORT=4000 pnpm --filter @lite-notion/api dev
```

## Команды

| Команда | Назначение |
| --- | --- |
| `pnpm dev` | Запустить frontend и API в watch mode |
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

## OpenSpec

OpenSpec уже инициализирован в каталоге `openspec`. Активные изменения можно посмотреть командой:

```bash
openspec list
```

Новые возможности и инфраструктурные изменения следует сначала оформлять как OpenSpec change, а затем реализовывать по его задачам.
