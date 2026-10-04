## Контекст

См. `proposal.md` — мотивация и границы изменения. В текущей Prisma-модели revision хранится как PostgreSQL `BIGINT`. `TransactionRunner` передаёт `TransactionScope`, а репозитории создают отдельные экземпляры, привязанные к клиенту транзакции. Источник effective page roles — существующий механизм `PagePermissionsService` и `PagePermissionsRepository`.

## Цели и вне рамок

**Цели:**

- Представить создание отдельными application use cases, а metadata reads — отдельным read service в рамках текущей NestJS-архитектуры и transaction pattern.
- Сохранить page-scoped нумерацию при конкурентном создании, позволяя независимым страницам обрабатываться параллельно.
- Разделить пользовательское создание manual snapshot и внутренний выбор системного reason.
- Защитить metadata reads существующей проверкой effective page permissions и скрывать snapshot-ы других страниц.

**Вне рамок:**

- Получение live state из Hocuspocus или чтение `PageDocument` для создания snapshot.
- Publication, rendering, assets, restore, scheduler, HTTP endpoints и frontend.

## Решения

- **Блокировать строку страницы для revision allocation.** Use case блокирует живую строку `Page` через `SELECT ... FOR UPDATE`, затем читает последний snapshot revision и в той же транзакции вставляет следующий. Строка страницы служит точкой сериализации: операции одной страницы ждут друг друга, разные страницы не блокируются. Алгоритм читает последний revision только после получения блокировки, поэтому параллельное создание назначает consecutive revision без пропусков, вызванных allocation algorithm. Существующий unique constraint `(pageId, revision)` остаётся дополнительной гарантией БД. Общий `ownerLock` здесь не применяется: он сериализовал бы независимые страницы одного владельца.
- **Разделить создание на два use case.** `CreateSnapshotManualUseCase.execute()` принимает `CreateManualSnapshotInput`, проверяет effective permission существующим механизмом с требованием `EDITOR+`, фиксирует `reason = manual` и использует пользователя как creator. `CreateSnapshotInternalUseCase.execute()` принимает `CreateInternalSnapshotInput`, системный reason и nullable creator без пользовательской permission-проверки. Каждый use case имеет один публичный entry point `execute()`.
- **Передавать внешнюю транзакцию через `TransactionScope`.** Оба use case принимают optional scope и самостоятельно владеют своим command flow: открывают транзакцию через `TransactionRunner`, если scope не передан, либо используют переданный scope, блокируют строку страницы, вычисляют следующий page-scoped revision и вставляют snapshot. Низкоуровневые transaction и repository abstractions переиспользуются; общего creation workflow или промежуточного слоя между use case и repositories нет.
- **Скопировать Yjs state до первого `await`.** Каждый create use case синхронно делает defensive copy `yjsState`, чтобы caller mutation после вызова не меняла сохраняемые bytes.
- **Сохранить точность данных захвата.** `CapturedDocumentState` содержит `yjsState: Uint8Array`, `storageRevision: bigint` и `tiptapSchemaVersion: number`. `bigint` соответствует PostgreSQL-типу и исключает потерю точности. Snapshot revision и source revision остаются `bigint` в application metadata.
- **Защитить metadata reads существующими permissions.** Metadata application methods проверяют effective access через существующий `PagePermissionsService`/`PagePermissionsRepository`; второй алгоритм ролей не создаётся. Список ограничен `pageId`. Lookup конкретного snapshot выполняет запрос по паре `pageId + snapshotId`, а не по глобальному `snapshotId` с последующей проверкой страницы. Для отсутствующей, удалённой, недоступной страницы или snapshot другой страницы сохраняется безопасная not-found семантика. Repository выбирает только metadata и минимальное представление creator (`id`, `name`), не выбирая `yjsState`.
- **Разделить module capabilities.** `SnapshotsService` содержит только `listMetadata()` и `getMetadata()` и экспортируется для чтения. `CreateSnapshotInternalUseCase` также экспортируется как reusable write capability для будущих publication/history/capture workflows; `CreateSnapshotManualUseCase` остаётся доступен только внутри `SnapshotsModule`. Будущие command controllers вызывают соответствующий use case напрямую. REST/controller сейчас не добавляются.
- **Следовать CQRS-направлению.** Write/change operations представлены отдельными use case; сервис не служит фасадом команд. Текущие reads могут идти через service, а целевое read-side направление — специализированные read repositories или query layer.
- **Зафиксировать фактические snapshots пути.** Commands: `CreateSnapshotManualUseCase.execute()` и `CreateSnapshotInternalUseCase.execute()` выполняют собственную последовательность создания и обращаются к repositories/infrastructure. Reads: `SnapshotsService.listMetadata()` и `SnapshotsService.getMetadata()` → `SnapshotsRepository` → DB. Snapshot controller в change не добавляется; при появлении read endpoints controller вызывает `SnapshotsService`. Специализированный read query layer остаётся будущим направлением.
- **Добавить составной candidate key.** Prisma объявляет `@@unique([id, pageId])`; migration добавляет соответствующий unique index без изменений существующих уникальности `(pageId, revision)` и индексов истории.
- **Оставить snapshot append-only на уровне application API.** Repository не предоставляет update или replace operation. Как и существующая persistence capability, это не запрещает прямое изменение строки привилегированным SQL.

## Риски и компромиссы

- [Прямой SQL writer может обойти протокол блокировки строки страницы] → Сохранить `(pageId, revision)` как unique backstop; поддерживаемый путь записи проходит через соответствующий create use case. Database trigger не добавляется.
- [Captured state может устареть до сохранения] → Сохранять source revision; согласование capture с collaboration storage относится к следующему этапу issue #48.
- [Permission может быть отозван одновременно с созданием] → Проверять effective role существующим permission mechanism перед snapshot creation. Page-row lock сериализует revision allocation для страницы, но revoke permission и создание snapshot не являются одной сериализованной операцией.
- [Ошибка вызывающей операции может оставить snapshot, если запись выйдет за её транзакцию] → PostgreSQL integration test создаёт snapshot через caller-provided `TransactionScope`, выбрасывает ошибку и проверяет отсутствие строки после rollback.
- [Глобальный поиск по snapshot id мог бы раскрыть существование snapshot другой страницы] → Выполнять page-scoped lookup по `pageId` и `snapshotId` одним запросом и проверять права на указанную страницу.

## План миграции

1. Добавить составной unique key в Prisma schema и новую migration.
2. Применить additive migration до включения snapshot service.
3. Для rollback откатить приложение и migration до появления зависимых от composite key foreign key.
