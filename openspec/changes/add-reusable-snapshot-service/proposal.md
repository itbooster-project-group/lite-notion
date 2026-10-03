## Почему

Текущая ветка добавила только таблицу snapshot-ов. Следующий этап issue #48 должен предоставить безопасный переиспользуемый backend-сервис, который принимает уже захваченное authoritative состояние документа, атомарно назначает revision и отдаёт защищённые metadata для следующих серверных этапов.

## Что меняется

- Добавляется составной unique key snapshot `(id, pageId)` для будущего composite FK без изменения существующих ограничений и индексов.
- Создаётся отдельный NestJS snapshots module с раздельными `CreateSnapshotManualUseCase.execute()` и `CreateSnapshotInternalUseCase.execute()` для append-only создания и `SnapshotsService` только для metadata reads.
- Create use cases используют переданный captured document state и не читают Hocuspocus или `PageDocument`.
- Revision allocation сериализуется блокировкой строки страницы; создание и metadata reads используют существующий механизм page permissions.
- Каждый write use case предоставляет один `execute()`. Manual creation всегда фиксирует `reason = manual`; только trusted internal use case принимает системные reasons `automatic`, `publication` или `restore`.
- `CreateSnapshotInternalUseCase` экспортируется для будущих publication/history/capture workflows; `SnapshotsService` экспортируется для read capability, а manual use case остаётся внутренним provider.
- Backend движется к CQRS: write operations идут через use cases, текущие metadata reads остаются за `SnapshotsService`, целевое направление read-side — специализированный query layer.
- Для metadata добавляются permission-protected list и page-scoped lookup с безопасными not-found ответами.
- Не добавляются publication flow, rendering, assets, restore, collaboration capture, REST endpoints или frontend UI.

## Capabilities

### Новые capabilities

### Изменяемые capabilities

- `document-snapshot-persistence`: создание snapshot, безопасная нумерация, разделение user/internal reason, проверка доступа к metadata и metadata reads.

## Влияние

- API: новый `apps/api/src/snapshots` module и unit/PostgreSQL integration tests, включая конкурентное продолжение существующей revision sequence и rollback внешней transaction.
- Database: Prisma schema и migration с дополнительным composite unique index.
- OpenSpec: уточнение существующей snapshot capability; OpenAPI и frontend не меняются.
