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

## Документация

- [План на MVP](docs/mvp-plan.md) — объём MVP, этапы работ и состав задач по каждому этапу.
- [Схемы экранов MVP](docs/mvp-screens.md) — схематичные макеты интерфейса по каждому этапу.
- [Схема базы данных](docs/database-schema.md) — ER-диаграмма, описание сущностей и ключевые проектные решения.
- [Гайд по OpenSpec workflow](docs/openspec-workflow.md) — процесс работы с изменениями и coding agents.

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

