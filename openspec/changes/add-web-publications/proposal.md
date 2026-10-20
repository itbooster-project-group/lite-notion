## Why

Backend #52 уже отделяет immutable опубликованный snapshot от live collaborative document, но Web пока не даёт управлять публикацией и показывать этот read model анонимному посетителю. Пользователю нужны явные Publish/Republish/Unpublish, а опубликованная страница должна открываться и индексироваться без загрузки editor runtime.

## What Changes

- Добавить в существующую страницу редактора управление состоянием publication, slug, SEO title/description и публичной ссылкой через существующие authenticated API и generated client; безопасно разрешать неопределённые mutation outcomes без повторного запуска небезопасных команд.
- Добавить публичный SSR route `/p/[slug]`, читающий только public publication API и immutable `contentJson`.
- Отрисовывать поддерживаемую TipTap schema v2 через уже установленный `@tiptap/static-renderer`, использовать snapshot-consistent cover и publication-safe asset resolver.
- Оставить public route на динамическом SSR с `no-store`; принимать backend outbox events через минимальный authenticated ACK endpoint, не вызывая `revalidatePath` для некэшируемого route.
- Выделить static-safe schema boundary, чтобы публичный route транзитивно не загружал редактор, Yjs или collaboration runtime.

## Capabilities

### New Capabilities

- `web-publication-management`: управление publication в редакторе, достоверное отображение её состояния и ошибки команд.
- `public-publication-pages`: анонимная SSR-страница по `/p/[slug]`, статический рендер immutable content, SEO и безопасная выдача опубликованных assets.
- `web-publication-revalidation`: cache policy для dynamic SSR и безопасный ACK уже существующих backend outbox events, чтобы configured delivery не оставляла pending backlog.

### Modified Capabilities

Нет. Существующие backend requirements #52 и editor/asset contracts используются без изменения наблюдаемого поведения.

## Impact

- Web: `apps/web/app`, route-specific publication management в `apps/web/src/pages/workspace`, public publication page composition, static-safe public API `entities/page-document`, editor-specific collaboration composition в `features/page-editing`, shared API exports, public response headers.
- Generated API: использовать сгенерированные management endpoints/hooks и DTO через существующий `shared/api` public API; для anonymous SSR импортировать только generated DTO как type-only, не импортируя endpoint module с React Query и не копируя контракты вручную. MSW обновлять только если генерация/контракт потребуют этого.
- Backend: существующие endpoints из `apps/api/src/publications` и PostgreSQL outbox остаются источниками истины; схема БД и backend не меняются.
- Конфигурация/документация: описать server-only `PUBLICATION_REVALIDATION_TOKEN` для Web и соответствующий URL в API; CI тестирует ACK endpoint с тестовым токеном, deployment secrets не коммитятся. Backend не удаляет доставленные outbox rows, поэтому ACK снимает pending backlog, но не задаёт retention общей таблицы.
- Проверки: существующие Vitest/RTL, Playwright, API generated-client workflow, lint, typecheck и build.
