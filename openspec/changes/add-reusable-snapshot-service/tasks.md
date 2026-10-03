## 1. Основа schema

- [x] 1.1 Добавить `@@unique([id, pageId])` и migration, не меняя существующие snapshot constraints и индексы.
- [x] 1.2 Перегенерировать Prisma Client и проверить schema и migration.

## 2. Snapshot application operations

- [x] 2.1 Добавить типы captured document и metadata, snapshots repository и NestJS module.
- [x] 2.2 Реализовать общую transaction-aware persistence логику с блокировкой строки страницы, page-scoped revision allocation и append-only insert.
- [x] 2.3 Представить manual и internal creation отдельными use case с одним методом `execute()` каждый; для manual использовать существующий page permission mechanism.
- [x] 2.4 Добавить permission-protected metadata list и page-scoped lookup, которые не выбирают Yjs state и сохраняют безопасную not-found семантику.
- [x] 2.5 Экспортировать internal create use case для будущих backend workflows, оставить manual use case внутренним provider, а `SnapshotsService` — read-only API; скопировать Yjs bytes до первого `await` в обоих use case.

## 3. Проверка

- [x] 3.1 Добавить unit tests на captured provenance, reason/creator, permissions создания, defensive copy обоих create use case и metadata reads, safe not-found semantics, page-scoped lookup, transaction reuse и отсутствие Yjs state в metadata response.
- [x] 3.2 Добавить PostgreSQL integration tests на два конкурентных создания новой страницы с результатом `[1n, 2n]` и на два конкурентных создания при существующем latest revision `5n` с результатом `[6n, 7n]`; в обоих случаях проверить успешное сохранение обоих snapshot, уникальность и consecutiveness revisions и продолжение существующей page-scoped sequence. Также проверить rollback snapshot, созданного во внешней transaction, завершившейся ошибкой, и metadata permissions/page-scoped lookup.
- [x] 3.3 Проверить OpenSpec и запустить lint, typecheck, unit tests, integration tests, Steiger, API checks и API build.
- [x] 3.4 Проверить module exports, синхронизировать архитектурные/OpenSpec docs с разделёнными use case и повторно выполнить актуальный набор проверок для review follow-up.
