## Why

Пользователю нужен единый поиск по названиям страниц и содержимому сохранённых collaborative documents. Сейчас persisted Y.Doc остаётся единственным источником содержимого, но у backend нет поисковой проекции и API, которое одновременно учитывает effective permissions.

## What Changes

- Добавить восстанавливаемую из persisted Y.Doc поисковую проекцию с revision tracking, PostgreSQL full-text vector и GIN indexes.
- Индексировать только сохранённое состояние документа через существующий schema-aware document projection boundary; сбои поиска не должны менять результат Yjs persistence.
- Добавить ограниченный, детерминированно ранжированный Search API по текущему title и актуальному body text; отсутствие/отставание body projection не блокирует поиск по title.
- Фильтровать кандидатов по effective permissions до выдачи metadata; исключать удалённые страницы и проекты.
- Добавить периодическое восстановление отставших проекций и повторно запускаемый backfill/rebuild на том же индексаторе.

### Scope

Backend schema/migration, projection extraction и indexing, scheduler/retry, CLI backfill/rebuild, Search read layer, permission integration, REST DTO/OpenAPI и тесты.

### Out of Scope

Search UI (#54), breadcrumb/path, search по публикациям или истории snapshots, fuzzy/semantic/vector search, embeddings, AI ranking, внешние search engines, comments/tasks/audit log, analytics и advanced filters.

### Dependencies

- Persisted Y.Doc и `storageRevision` из Hocuspocus persistence (#45).
- Shared schema-aware document projection (#47/#97), используемая также публикациями (#52).
- Effective page permissions (#43).
- Web UI (#54) потребляет только безопасные ограниченные результаты; отдельная UI-реализация не входит в этот change.

### Expected Value

Пользователь сможет находить доступные ему страницы по актуальным названиям и сохранённому содержимому. Projection можно восстанавливать без редактирования документа, а search не становится источником истины и не раскрывает закрытые данные.

## Capabilities

### New Capabilities

- `page-search`: восстанавливаемая search projection и permission-safe полнотекстовый поиск страниц.

### Modified Capabilities

Нет.

## Impact

- API: новый search module/read layer, extractor, projection use case, scheduler, CLI rebuild entrypoint, query/response DTO и authenticated endpoint.
- Database: Prisma model и additive PostgreSQL migration для `PageSearchDocument`, revision/retry state и GIN indexes.
- Permissions: минимальное пакетное расширение существующего read layer для проверки FTS candidate IDs тем же effective-permission алгоритмом.
- Tests/OpenAPI: PostgreSQL integration coverage для FTS, транзакций, locking и permissions; обновлённый OpenAPI contract.
- Новые внешние сервисы и зависимости не требуются.
