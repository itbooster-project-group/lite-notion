## Контекст

См. `proposal.md` — мотивация и границы изменения. В текущей Prisma-модели revision хранится как PostgreSQL `BIGINT`. `TransactionRunner` передаёт `TransactionScope`, а репозитории создают отдельные экземпляры, привязанные к клиенту транзакции. Источник effective page roles — существующий механизм `PagePermissionsService` и `PagePermissionsRepository`.

## Цели и вне рамок

**Цели:**

- Добавить переиспользуемый snapshot application service и metadata reads в рамках текущей NestJS-архитектуры и transaction pattern.
- Сохранить page-scoped нумерацию при конкурентном создании, позволяя независимым страницам обрабатываться параллельно.
- Разделить пользовательское создание manual snapshot и внутренний выбор системного reason.
- Защитить metadata reads существующей проверкой effective page permissions и скрывать snapshot-ы других страниц.

**Вне рамок:**

- Получение live state из Hocuspocus или чтение `PageDocument` для создания snapshot.
- Publication, rendering, assets, restore, scheduler, HTTP endpoints и frontend.

## Решения

- **Блокировать строку страницы для revision allocation.** Use case блокирует живую строку `Page` через `SELECT ... FOR UPDATE`, затем читает последний snapshot revision и в той же транзакции вставляет следующий. Строка страницы служит точкой сериализации: операции одной страницы ждут друг друга, разные страницы не блокируются. Алгоритм читает последний revision только после получения блокировки, поэтому параллельное создание назначает consecutive revision без пропусков, вызванных allocation algorithm. Существующий unique constraint `(pageId, revision)` остаётся дополнительной гарантией БД. Общий `ownerLock` здесь не применяется: он сериализовал бы независимые страницы одного владельца.
- **Передавать внешнюю транзакцию через `TransactionScope`.** Методы создания `SnapshotsService` принимают optional scope. Без него use case открывает транзакцию через `TransactionRunner`; с ним выполняет ту же операцию через репозитории, привязанные к переданному scope. Это исключает второй путь persistence и вложенную транзакцию.
- **Разделить типизированные методы создания.** User-facing application API фиксирует `reason = manual` и требует `createdById`; вызывающий код не выбирает reason. Только отдельный trusted internal API принимает системные reasons (`automatic`, `publication`, `restore`) и nullable creator. REST/controller сейчас не добавляются. Оба метода используют одну операцию создания.
- **Сохранить точность данных захвата.** `CapturedDocumentState` содержит `yjsState: Uint8Array`, `storageRevision: bigint` и `tiptapSchemaVersion: number`. `bigint` соответствует PostgreSQL-типу и исключает потерю точности. Snapshot revision и source revision остаются `bigint` в application metadata.
- **Защитить metadata reads существующими permissions.** Metadata application methods проверяют effective access через существующий `PagePermissionsService`/`PagePermissionsRepository`; второй алгоритм ролей не создаётся. Список ограничен `pageId`. Lookup конкретного snapshot выполняет запрос по паре `pageId + snapshotId`, а не по глобальному `snapshotId` с последующей проверкой страницы. Для отсутствующей, удалённой, недоступной страницы или snapshot другой страницы сохраняется безопасная not-found семантика. Repository выбирает только metadata и минимальное представление creator (`id`, `name`), не выбирая `yjsState`.
- **Экспортировать application service.** `SnapshotsModule` экспортирует `SnapshotsService`, чтобы внутренние use cases из импортирующих модулей могли использовать snapshot capability и передавать активный `TransactionScope`. Это обеспечивает переиспользование в будущих потоках без реализации publication сейчас.
- **Добавить составной candidate key.** Prisma объявляет `@@unique([id, pageId])`; migration добавляет соответствующий unique index без изменений существующих уникальности `(pageId, revision)` и индексов истории.
- **Оставить snapshot append-only на уровне application API.** Repository не предоставляет update или replace operation. Как и существующая persistence capability, это не запрещает прямое изменение строки привилегированным SQL.

## Риски и компромиссы

- [Прямой SQL writer может обойти протокол блокировки строки страницы] → Сохранить `(pageId, revision)` как unique backstop; поддерживаемый путь записи проходит через snapshot application service. Database trigger не добавляется.
- [Captured state может устареть до сохранения] → Сохранять source revision; согласование capture с collaboration storage относится к следующему этапу issue #48.
- [Права могут измениться одновременно с созданием] → Вычислять effective role внутри snapshot transaction через существующий permission mechanism. Snapshot creation не вводит отдельное кешированное или дублирующее решение о правах.
- [Ошибка внешнего workflow может оставить snapshot, если запись выйдет за его транзакцию] → PostgreSQL integration test создаёт snapshot через caller-provided `TransactionScope`, выбрасывает ошибку и проверяет отсутствие строки после rollback.
- [Глобальный поиск по snapshot id мог бы раскрыть существование snapshot другой страницы] → Выполнять page-scoped lookup по `pageId` и `snapshotId` одним запросом и проверять права на указанную страницу.

## План миграции

1. Добавить составной unique key в Prisma schema и новую migration.
2. Применить additive migration до включения snapshot service.
3. Для rollback откатить приложение и migration до появления зависимых от composite key foreign key.
