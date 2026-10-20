## Context

См. `proposal.md` и `specs/page-publications/spec.md` для цели и внешних требований. Базовые компоненты проекта: authoritative `DocumentCaptureClient`, collaboration capture с persistence/CAS и точным `storageRevision`, `CreateSnapshotInternalUseCase` с optional `TransactionScope`, schema-aware `projectDocument`, page asset grants/projection/GC, private `ObjectStorage`, effective permission query, `TransactionRunner` и единственный `ownerLock`. `SnapshotReason.publication` уже определён. Этот change добавляет publication persistence/API и outbox поверх этих компонентов.

Фактические границы важны для конкурентности: page/project lifecycle use-cases берут `ownerLock`; page permission grant/revoke сейчас выполняются из `PagePermissionsService` без транзакции и owner lock; cover update уже берёт `PageDocument FOR UPDATE`, затем Asset и обновляет Page. Поэтому текущий owner lock сам по себе ещё не сериализует permission revoke с публикацией, а порядок locks для cover нельзя игнорировать.

Актуальная схема — `docs/database-schema-v2.md`; путь `docs/database-schema.md` из issue отсутствует. V2 описывает `DocumentRendering`, `SnapshotAsset` и `PagePublication`, но не durable revalidation outbox. Это изменение ограничено OpenSpec-файлами; задача реализации должна синхронизировать outbox с v2 до создания миграции.

## Goals / Non-Goals

**Goals:** использовать текущие capture/snapshot/projection contracts; атомарно переключать immutable publication; разрешать менеджерское чтение для frontend #53; удержать current assets и согласованно разрешать title/cover; сделать permission/lifecycle checks сериализуемыми; дать точный public asset и invalidation contract.

**Non-Goals:** frontend UI/SSR implementation, изменение collaboration persistence, общий CQRS refactor, второй projection/converter, новая lock abstraction, Redis/BullMQ/event bus, history restore, search или долговременный public HTML cache.

## Decisions

### 1. Capture и projection

1. До внешнего capture проверить effective `EDITOR+` permission и active page/project, чтобы отказ не вызывал collaboration. Использовать `DocumentCaptureClient.capture(pageId)`, а не читать `PageDocument.yjsState` напрямую.
2. Успешный capture уже возвращает точные persisted bytes, `storageRevision` этой записи и schema version. Эти bytes копируются и ровно один раз передаются в общий `projectDocument`. Из полученного результата взять `contentJson` и asset refs; не делать повторный capture или независимый Yjs → TipTap converter.
3. Unsupported schema/content, invalid media, timeout, persistence failure и malformed capture response завершают publish до publication transaction. `sourceStorageRevision` всегда берётся из capture результата.
4. Ни collaboration HTTP, ни object storage/signed URL calls не выполняются внутри длительной транзакции. `ready`, grants, lifecycle и текущие cover повторно проверяются в транзакции под нужными locks.

Edit, применённый после возвращённых captured bytes, остаётся live-only. Его последующая persistence может иметь более позднюю revision; это не меняет snapshot и rendering текущей publication.

### 2. Модели, state machine и constraints

Additive Prisma models:

- `DocumentRendering`: `snapshotId` PK, schema version, `contentJson`, `pageTitle`, nullable `coverAssetId`, `generatedAt`. Body JSON остаётся производным и не содержит URLs; title/cover фиксируются в publication transaction.
- `SnapshotAsset`: `(snapshotId, assetId, nodeId)` PK и `createdAt`; refs immutable и отличны от `PageAsset` live projection.
- `PagePublication`: одна строка на page, `slug NOT NULL`, status, SEO fields, nullable snapshot только для draft, `publishedAt`, `updatedAt`.
- `PublicationRevalidation`: immutable event id/path list плюс попытки, `nextAttemptAt`, `leaseToken`, `leaseUntil`, `deliveredAt`, `lastErrorCode`. В outbox нет FK на page/publication: ожидающее invalidation должно пережить hard purge page.

Допустимые application transitions:

| Текущее состояние | Операция | Следующее состояние |
| --- | --- | --- |
| No record | Metadata update с обязательным slug | `draft` |
| No record или `draft` | First publish с обязательным slug | `published` |
| `draft` | Metadata update с валидным slug | `draft` |
| `draft` | Unpublish | **Запрещено**, `409 publication_state_conflict` |
| `published` | Republish | `published`, новый snapshot |
| `published` | Metadata update | `published`, тот же snapshot |
| `published` | Unpublish | `unpublished`, тот же исторический snapshot |
| `unpublished` | Republish | `published`, новый snapshot |
| `unpublished` | Metadata update | `unpublished`, тот же snapshot |
| `unpublished` | Повторный unpublish | `unpublished`, idempotent no-op |
| `published` или `unpublished` | First publish | **Запрещено**; для публикации нужен `republish` |

Отсутствующий row при unpublish/republish — `404 publication_not_found`. PATCH slug optional только для существующего row: если row отсутствует, `slug` обязателен и создаётся `draft`; slug никогда не nullable и не может быть очищен. SEO `null` очищает поле.

PostgreSQL constraints держат PK/unique page, global unique non-null slug, FK и composite FK `(snapshotId,pageId) → DocumentSnapshot(id,pageId)`, а также форму row: draft без snapshot/`publishedAt`, published с обоими, unpublished с последним snapshot/`publishedAt`. CHECK constraints не обеспечивают переходы между состояниями; transitions являются application-level решениями внутри use-case transactions. Готовность rendering, asset eligibility и соответствие snapshot page также проверяются transaction flow; public read fail-closed.

Slug canonicalization: trim/lowercase, ASCII `[a-z0-9]+(?:-[a-z0-9]+)*`, 1–100 chars; non-ASCII не транслитерировать. Резервировать `api`, `login`, `register`, `profile`, `trash`, `projects`; точки и path separators не проходят grammar. SEO title до 255 символов, description до 1000. SEO title fallback — immutable `pageTitle`, description при null отсутствует.

### 3. Transaction order, permissions и ownerLock

Каждая write operation — отдельный use-case с `TransactionRunner`; controller напрямую вызывает соответствующий use-case. Owner lock ключ строится по **page owner**, не по actor: editor и owner должны сериализоваться с одинаковыми page/project operations.

`PublishPageUseCase` и `RepublishPageUseCase` каждый явно выполняют preflight, capture/projection, открывают transaction, берут owner lock, повторно проверяют effective permission/lifecycle и выбирают допустимость операции по текущему publication row. Они отвечают за slug conflict mapping только для `PagePublication.slug`. Единственный shared provider `PublicationVersionPersistence` не выбирает сценарий, не проверяет права/state, не открывает transaction и не вызывает внешние сервисы; он только сохраняет уже выбранный use-case-ом snapshot/rendering/asset refs/publication/outbox в переданный `TransactionScope`. Дублирование одинаковых lock/check/write шагов в двух use-cases намеренно остаётся видимым и не выносится в новый publication workflow.

Publish/republish выполняется в таком порядке:

1. До capture получить page owner и выполнить предварительную effective-role/lifecycle проверку.
2. Capture + projection вне transaction.
3. В transaction взять `ownerLock(page.ownerId)`.
4. Повторно проверить active page/project и `EDITOR+` через repositories bound к `TransactionScope`.
5. Заблокировать `PageDocument` этой страницы `FOR UPDATE`. Этот порядок согласован с существующим cover/grant/projection/GC порядком, который начинает с PageDocument.
6. Прочитать cover id страницы под уже удерживаемым PageDocument lock; собрать уникальные content assets и cover, затем взять все соответствующие Asset row locks по UUID ascending.
7. Проверить полный набор assets, `ready`, page grant для content и cover, и eligibility cover в этой же транзакции.
8. Вызвать `CreateSnapshotInternalUseCase.execute(input, scope)`. Он блокирует активную Page row и назначает следующую revision. После этой блокировки прочитать `pageTitle` и подтвердить зафиксированный cover id; update title, не использующий PageDocument, сериализуется на Page row. Cover update не может пройти PageDocument lock.
9. Вставить Rendering/SnapshotAsset, update/create PagePublication и insert revalidation event; commit.

Порядок `ownerLock → PageDocument → Assets sorted → Page` соответствует существующему `AssetsUseCases.setCover` (`PageDocument → Asset → Page`) и GC (`PageDocument rows → Asset`). Publication не берёт Asset до PageDocument и не берёт Page до Asset, поэтому не образует обратного цикла с cover writer/GC. Строка PageDocument удерживается только в короткой transaction; внешних запросов там нет.

#### Permission revoke, включая inherited role

До изменения `PagePermissionsService.grant/revoke` писали без owner lock. Реализация узко переносит только эти writes в отдельные `GrantPagePermissionUseCase`/`RevokePagePermissionUseCase`; `PagePermissionsService` остаётся read-side. Каждый use-case берёт уже существующий `ownerLock(actorId)` (только page owner может менять permissions), затем внутри транзакции повторно проверяет OWNER и делает upsert/delete через bound `PagePermissionsRepository`.

Страницы одного дерева принадлежат одному owner, поэтому revoke direct permission на leaf и revoke inherited permission на ancestor берут тот же owner key, что publish этого owner. При revoke-first publish после lock видит актуальную effective role и отказывает; при publish-first revoke ждёт завершения и имеет более позднюю точку сериализации. Новая lock abstraction не нужна. Integration tests на PostgreSQL должны показать обе очередности для direct и inherited grants; если доказательство не подтверждает контракт, работа останавливается для отдельного архитектурного решения, а не добавляет новый lock.

### 4. Management read API, write API и repository boundaries

Management API закрыт global `JwtAuthGuard` и доступен пользователю с effective `EDITOR+`; viewer с видимостью получает 403, недоступная/удалённая page — существующий 404. Добавить `GET /api/v1/pages/:pageId/publication`. Он возвращает DTO `{ status, slug, seoTitle, seoDescription, publishedAt, publicPath }`. Persisted row всегда имеет slug. Для `published` значение `publicPath` строго `/p/${slug}`; для `draft` и `unpublished` оно `null`. Это относительный frontend route: API не строит абсолютный URL и не использует `CORS_ORIGIN` или входящий Host. Активная страница без publication row даёт `404 publication_not_found`, soft-deleted page/project — 404 существующей page семантики.

Write endpoints: `POST /pages/:pageId/publication/publish`, `/republish`, `/unpublish`, `PATCH /pages/:pageId/publication`; DTOs отражают state machine. Slug/SEO validation и transport error mapping остаются в API boundaries, решения и транзакции — в use-cases.

`PublicationsRepository` пишет только publication aggregate tables и предоставляет `bind(scope)`. Public/manage read использует один узкий `PublicationsReadService`/query provider на Prisma для cross-table projection: ему нужны Page, Project, PagePublication, Snapshot, Rendering, SnapshotAsset и Asset в одном safe query. Это read-side query layer, не дополнительный write repository; он не пишет и не возвращает domain errors. Он отбирает только published + live lifecycle и строит strict allowlist response. Manager GET сперва использует существующий `PagePermissionsService.requireRole`, затем читает свою publication projection. Не проводить общий read/CQRS refactor.

Public endpoints помечаются существующим `@Public()`:

- `GET /api/v1/public/publications/:slug` возвращает snapshot-bound title, SEO, schema version, immutable `contentJson`, image descriptors и cover descriptor; одинаковый 404 при missing/unpublished/deleted/invalid rendering.
- `GET /api/v1/public/publications/:slug/assets/:assetId` проверяет membership только в current published snapshot refs либо current rendering cover, active page/project и ready status; затем отвечает `302 Found`, пустым body и `Location: <short-lived signed object URL>`. Headers: `Cache-Control: private, no-store, max-age=0`, `Referrer-Policy: no-referrer`. Иные ответы — safe 404, без подписания URL.

Rendering `contentJson` сохраняет исходные media references (`source.assetId`), без URL. Public read возвращает descriptor `{ assetId, mimeType, width, height, resolverPath }` для каждого referenced image и cover, где `resolverPath` — relative API path `/api/v1/public/publications/${slug}/assets/${assetId}`. SSR #53 формирует абсолютный URL через URL resolution этого path относительно заранее настроенного `NEXT_PUBLIC_API_BASE_URL`, который должен быть absolute `http(s)` API origin без path/query/fragment. Он не использует `Host`, `X-Forwarded-Host` или origin из входящего запроса; так разные API/frontend origins работают без доверия произвольному Host. SSR сопоставляет image node `source.assetId` с descriptor и ставит сформированный API URL в rendered `img src`; отсутствие descriptor не должно превращать asset ID в URL или обращаться к private storage. Браузер выполняет 302 resolver, затем загружает signed URL. Signed URL никогда не записывается в rendering или outbox. Descriptor/redirect no-store. TTL — 60 секунд; уже выданный target нельзя мгновенно отозвать.

Точка авторизации resolver — read query, который одновременно проверяет current published publication, active lifecycle, membership в current snapshot/cover и `ready` asset. Если эта проверка завершилась до commit unpublish/republish, уже начатый resolver может закончить внешний signing и вернуть 302 после commit. Проверки, начавшиеся после commit, видят новое состояние и не выдадут URL. Это допустимое завершение in-flight запроса: дополнительных блокировок и транзакции вокруг object storage нет. TTL 60 секунд начинает отсчёт при генерации URL, поэтому задержка signing может перенести её выдачу за unpublish commit; мгновенный отзыв уже авторизованного resolver запроса не гарантируется. Детерминированный PostgreSQL тест управляет этой точкой promise barrier-ом, без sleep.

### 5. Lifecycle, retention и FK delete policies

Page/project soft delete уже сериализуются по owner lock и выполняются транзакционно. Узко расширить page/project soft-delete flows: одним scoped transaction сделать published rows affected pages unpublished и записать invalidation paths. Restore не меняет publication. Public query дополнительно фильтрует Page/Project lifecycle. Тестировать страницу с поддеревом и проект с несколькими активными публикациями, включая один invalidation batch; операция не должна оставить часть страниц проекта публичной.

GC учитывает content refs только snapshot, на который указывает current `PagePublication(status=published)`, и cover current Rendering. Исторические SnapshotAsset refs immutable, но не держат physical object; republish/unpublish позволяет GC удалить asset только если нет других активных refs. Lock publish соответствует GC: transaction держит PageDocument, затем assets по UUID; GC повторно проверяет refs и grant set под теми же asset/page locks. Storage delete остаётся после tombstone, вне DB transaction.

FK/delete policy:

- существующий `DocumentSnapshot.pageId → Page.id ON DELETE CASCADE` сохраняется; `createdById → User.id ON DELETE RESTRICT` сохраняет provenance.
- `DocumentRendering.snapshotId → DocumentSnapshot.id ON DELETE CASCADE`; `coverAssetId → Asset.id ON DELETE RESTRICT`.
- `SnapshotAsset.snapshotId → DocumentSnapshot.id ON DELETE CASCADE`; `assetId → Asset.id ON DELETE RESTRICT`. Asset GC использует soft-delete status, не SQL DELETE.
- `PagePublication.pageId → Page.id ON DELETE CASCADE`; composite snapshot FK same-page использует ON DELETE CASCADE, чтобы hard purge не оставлял ссылку на удалённый snapshot. Отдельные snapshot delete operations не вводятся.
- `PublicationRevalidation` намеренно не имеет page FK и хранит только paths, чтобы hard purge не уничтожил ещё не доставленную invalidation.

### 6. Revalidation, scheduler и SSR cache

DB transaction сохраняет idempotent invalidation event. Worker claim делает короткую transaction с `FOR UPDATE SKIP LOCKED`, сравнивает `nextAttemptAt` и expiry по часам PostgreSQL, назначает случайный lease token и `leaseUntil = clock_timestamp() + 30 seconds`, фиксирует claim и закрывает transaction. Это исключает зависимость срока владения lease от локальных часов API instances. Claim transaction ограничена `maxWait=500 ms` и `timeout=1000 ms`. Затем worker вызывает frontend HTTP **вне** transaction и conditionally ACK/records failure по lease token и активному сроку lease. После claim весь ожидающий путь ограничен суммой HTTP timeout ≤5 секунд и ACK/failure transaction (maxWait ≤500 ms + timeout ≤1000 ms), то есть ≤6.5 секунды внутри согласованного 10-секундного attempt deadline; вместе с bounded claim transaction верхняя оценка составляет 8 секунд. Fetch использует abort timeout, тело ответа не читается. Таким образом, async I/O всей попытки ограничен без отдельного timeout manager. Lease фиксированно истекает через 30 секунд. Если процесс остановлен/приостановлен дольше lease, другой instance может начать duplicate delivery: lease гарантирует единственный claim только до expiry, но не exactly-once. После рестарта API другой instance может забрать просроченное событие. Если первый процесс умер после успешного вызова frontend до ACK, событие доставляется повторно. Это безопасно, потому что endpoint только идемпотентно инвалидирует paths через `revalidatePath`; он не записывает HTML/content. ACK/failure SQL predicate требует совпадающий lease token и `leaseUntil > clock_timestamp()` при выполнении update; завершение старого worker отклоняется после expiry, даже если replacement claim ещё не выполнен.

Ошибки retry-ятся бесконечно с backoff 1s, 2s, 4s... capped at 5m; event хранит attempts/next time/category. На event без настроенного endpoint scheduler не claim-ит row и не увеличивает attempts, а один раз пишет безопасное предупреждение о disabled integration; приложение продолжает обслуживать API. Имена optional config: `PUBLICATION_REVALIDATION_URL`, `PUBLICATION_REVALIDATION_TOKEN` (настраиваются вместе или не задаются), optional `PUBLICATION_REVALIDATION_TIMEOUT_MS` default 5000 с допустимым диапазоном 1–5000 ms; превышение отвергается при config validation. Полный attempt deadline остаётся 10 секунд, lease — 30 секунд и не конфигурируется. Значения доступны через `ApplicationConfig`; секрет не включать в errors/logs. Обновить API env example и CI config validation.

Frontend contract #53: protected `POST /api/internal/revalidate`, body `{ eventId, paths: string[] }`; `paths` содержит только canonical frontend routes `/p/${slug}`. Любой повтор того же события повторно инвалидирует пути и возвращает 2xx после обработки всего набора. Publish/republish/unpublish/SEO change invalidates current `/p/:slug`; rename invalidates old и new `/p/:slug`; soft delete invalidates все affected `/p/:slug`. Management `publicPath` использует тот же формат. Backend API routes всегда `no-store`.

Delivery eventual-consistent: после unpublish/soft delete старый Next SSR HTML может оставаться доступным, пока outbox не доставлен; при outage или отсутствии endpoint задержка не имеет жёсткой верхней границы. Поэтому #53 MUST рендерить public HTML без долгоживущего Next cache (dynamic/no-store) до отдельного подтверждения надёжной стратегии revoke с bounded stale window. Сам outbox не является мгновенным revoke mechanism. Это ограничение сохраняется и после временных retry ошибок; включение long-lived cache — отдельное согласованное изменение после проверки frontend поведения и максимальной задержки.

Не вводить Redis, BullMQ или новую инфраструктуру: storage outbox остаётся в PostgreSQL, lease/retry — в имеющемся `@nestjs/schedule`.

### 7. Migration, documentation и tests

Миграция additive. До реализации синхронизировать `docs/database-schema-v2.md`: отражать фактические FK/delete policies, state shape, новый outbox и его отсутствие FK. Это documentation task implementation phase; текущий архитектурный review правит только OpenSpec files. Создать constraints и индексы, backfill не нужен. Rollback приложения не удаляет объекты или исторические строки; migration не откатывается destructive down.

Unit tests: command transitions/DTO validation, manager GET `publicPath` mapping, permission error mapping, resolverPath/API base URL construction без Host header, descriptor allowlist, scheduler config/no-endpoint и bounded timeout. PostgreSQL integration tests обязательны: FKs/CHECK/unique; транзакционный rollback; direct + inherited permission grant/revoke против publish в обе очередности; title/cover updates против publish; soft delete nested pages/project with multiple active publications; slug collisions; multi-instance outbox claim, attempt bound меньше lease, lease expiry after process restart simulation, duplicate/late ACK and out-of-order idempotent invalidation for `/p/:slug`; publish/GC race. Mocks не доказывают эти invariants.

## Risks / Trade-offs

- **Permission writes сейчас обходят owner lock** → включить только grant/revoke в owner-locked write use-cases; integration test direct и inherited permission revoke. Если внешний writer обходит use-case, гарантия теряется.
- **Cover write lock order отличается от publication** → publish начинает с PageDocument, затем sorted Assets, затем Page; PostgreSQL tests title/cover simultaneous publish должны исключить deadlock и доказать captured metadata соответствует сериализованному update.
- **Outbox delivery не мгновенна** → long-lived Next HTML cache запрещён до bounded revoke strategy; API всегда no-store.
- **Несколько scheduler instances** → lease claim через `SKIP LOCKED`, expired lease re-claim и idempotent event handler; delivery может дублироваться после remote success/local crash.
- **Endpoint отсутствует/недоступен** → событие остаётся durable без endpoint claims или ретраится после восстановления; route invalidation задерживается и наблюдаема.
- **DB CHECK не кодирует переходы и cross-table rendering readiness** → state decision в use-case transaction, public read fail-closed, real PostgreSQL tests.
- **Старые snapshot assets не удерживаются** → соответствует database-schema v2; использование старого snapshot для history restore потребует отдельной retention policy.
- **Signed URL переживает unpublish до TTL** → ограничить TTL 60 сек и не выдавать повторно после lifecycle change.
- **Outbox retention может расти** → не удалять pending events; delivered cleanup policy вне MVP, измерить размер/рост и согласовать TTL перед добавлением удаления.

## Migration Plan

1. До Prisma migration обновить `docs/database-schema-v2.md`, API `ApplicationConfig`/environment validation, `apps/api/.env.example` и CI validation defaults для optional revalidation settings.
2. Создать additive migration и Prisma models/constraints; проверить hard page purge cascades и snapshot/asset restrict semantics на PostgreSQL.
3. Деплоить backend endpoints/outbox с optional revalidation target. Без configured endpoint событие остаётся pending; public API no-store.
4. Подключить #53 management GET, public read, resolver и revalidation route. Сохранять Next public HTML dynamic/no-store до проверки надёжного bounded revoke approach.
5. Rollback приложения не удаляет таблицы/outbox/assets; остановить sender и оставить schema/data. Не возвращать long-lived HTML cache при неработающем delivery.

## Open Questions

Нет. DTO возвращает relative `publicPath`; SSR строит абсолютные asset resolver URLs из уже используемого `NEXT_PUBLIC_API_BASE_URL`. Optional revalidation config не требуется для старта и не блокирует backend работу. Long-lived Next cache остаётся запрещённым до отдельной проверки revoke guarantee.
