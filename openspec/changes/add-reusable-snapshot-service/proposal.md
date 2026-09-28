## Почему

Текущая ветка добавила только таблицу snapshot-ов. Следующий этап issue #48 должен предоставить безопасный переиспользуемый backend-сервис, который принимает уже захваченное authoritative состояние документа, атомарно назначает revision и отдаёт защищённые metadata для следующих серверных этапов.

## Что меняется

- Добавляется составной unique key snapshot `(id, pageId)` для будущего composite FK без изменения существующих ограничений и индексов.
- Создаётся отдельный NestJS snapshots module, экспортирующий `SnapshotsService`, с append-only созданием, transaction-aware API и metadata queries.
- Создание использует переданный captured document state; сервис не читает Hocuspocus или `PageDocument`.
- Revision allocation сериализуется блокировкой строки страницы; создание и metadata reads используют существующий механизм page permissions.
- User creation всегда фиксирует `reason = manual`; выбирать `automatic`, `publication` или `restore` может только trusted internal API.
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
