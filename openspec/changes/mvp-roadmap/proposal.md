## Why

Открытый PR #22 описывает MVP через устаревшую модель `USER/PAGE/BLOCK/TASK` и одиночное редактирование, тогда как утверждённая `docs/database-schema.md` задаёт профили и сессии, права на страницы, Yjs/Hocuspocus, assets, snapshots, поиск и отдельный publish pipeline. Нужен новый согласованный roadmap, чтобы документация, макеты и будущий GitHub backlog опирались на одну архитектуру.

## What Changes

- Добавить новый поэтапный MVP roadmap, в котором этапы проходят от identity и страниц до collaboration, assets, history, search и publication.
- Исключить самостоятельные задачи из MVP; отложенные сущности из схемы также оставить вне текущего roadmap.
- Переработать схемы экранов и PNG-макеты под новый состав MVP, удалив экраны самостоятельных задач.
- Сделать генерацию PNG воспроизводимой через root-команду pnpm и явно объявленный `puppeteer-core`.
- Добавить в README ссылки на MVP roadmap и связанные документы.
- Создать новый набор GitHub issues для ещё не выполняемых этапов; backend identity/session продолжает покрываться открытым PR #37 и новой issue не получает.
- Открыть новый PR из ветки `docs/plan`, сославшись на PR #22 как источник исходных материалов. PR #22 и старые issues не изменять и не закрывать.

Вне scope находятся runtime-код, Prisma-модели и миграции, реализация API и интерфейсов, изменение PR #37, а также редактирование или закрытие старых issues.

## Capabilities

### New Capabilities

Нет: изменение описывает roadmap и инструменты документации, не добавляя наблюдаемого поведения приложения.

### Modified Capabilities

Нет: существующие требования приложения не меняются.

## Impact

- Документация: `docs/mvp-plan.md`, `docs/mvp-screens.md`, PNG-макеты и README.
- Tooling: генератор макетов, root `package.json` и `pnpm-lock.yaml` из-за `puppeteer-core`.
- GitHub: новые roadmap issues и новый PR; существующие PR #22, PR #37 и старые issues остаются без изменений.
- Frontend/backend/infrastructure runtime не изменяются; документы только планируют их будущую реализацию.
