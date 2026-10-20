## 1. Схема базы данных

- [x] 1.1 До миграции синхронизировать `docs/database-schema-v2.md` с `DocumentRendering`, `SnapshotAsset`, `PagePublication`, state shape, FK delete policies и `PublicationRevalidation` lease/outbox; схема v2 не должна оставаться неполной относительно реализации.
- [x] 1.2 Добавить Prisma models для rendering, snapshot refs, publication и leased revalidation outbox; `PagePublication.slug` сделать non-null, а outbox оставить без FK на страницу, чтобы hard purge не удалял pending invalidations.
- [x] 1.3 Добавить additive migration: page/global slug uniqueness, same-page composite snapshot FK, row-shape CHECK и индексы pending/lease/read queries; rendering/snapshot refs cascade вместе со snapshot, asset FKs restrict, publication cascade при hard purge. Проверить FK cascades/restrict и row constraints на реальной PostgreSQL; переходы статусов не считать DB CHECK invariant.

## 2. Persistence, permissions и lifecycle границы

- [x] 2.1 Добавить write repository только для publication aggregate и отдельный read-side query provider для safe cross-table projection; repository не обращается к Page/Project чужих aggregates, read query не пишет и не выдаёт domain errors.
- [x] 2.2 Перевести только grant/revoke permissions в отдельные transactional use-cases, использующие существующий `ownerLock(actorOwnerId)`; после lock повторно проверить OWNER и выполнить write через bound `PagePermissionsRepository`, оставив `PagePermissionsService` read-side.
- [x] 2.3 Расширить GC retention query для current snapshot/current cover и добавить PostgreSQL race checks; подтвердить, что только active refs блокируют GC, а historical/unpublished refs сами не блокируют.
- [x] 2.4 Интегрировать soft delete страницы и проекта с bulk unpublish всех affected publications и durable invalidation в тех же transactions; протестировать soft-deleted subtree и проект с несколькими активными публикациями, rollback и restore без auto-republish.

## 3. Publish pipeline

- [x] 3.1 Реализовать отдельные publish/republish use-cases: предварительная permission/lifecycle проверка, `DocumentCaptureClient`, один `projectDocument` вызов и затем DB transaction с owner lock владельца страницы плюс повторными permission/lifecycle checks.
- [x] 3.2 Соблюсти lock order `ownerLock → PageDocument → Asset rows sorted → Page`: serialized cover id и eligibility прочитать/проверить под locks; reuse `CreateSnapshotInternalUseCase.execute(..., scope)`, затем зафиксировать title после Page row lock и атомарно записать rendering/refs/publication/outbox.
- [x] 3.3 Добавить PostgreSQL concurrency tests для direct и inherited permission revocation в обе очередности с publish; проверить, что owner lock закрывает гонку после focused grant/revoke use-case conversion и не требует второй lock.
- [x] 3.4 Проверить exact `sourceStorageRevision`, совпадение captured bytes/JSON/refs, live edits после capture и rollback при capture/projection/schema/asset/rendering errors; добавить конкурентные rename-title/cover tests, подтвердив serialized immutable metadata и отсутствие deadlock.

## 4. Управляющий API

- [x] 4.1 Добавить отдельные use-cases unpublish и metadata update с формальной state transition table: запрещать draft→unpublished и first-publish из unpublished, разрешать republish из unpublished, делать повторный unpublish idempotent; создать draft через metadata update только с обязательным slug.
- [x] 4.2 Добавить authenticated `GET /pages/:pageId/publication` и DTO `{ status, slug, seoTitle, seoDescription, publishedAt, publicPath }`; требовать EDITOR+, возвращать publication_not_found без side-effect при отсутствии row, page 404 для soft delete и `/p/${slug}` только для published; не строить absolute URL из CORS_ORIGIN или request Host.
- [x] 4.3 Добавить authenticated DTO/controllers для `publish`, `republish`, `unpublish`, metadata PATCH; controller write routes напрямую вызывают use-cases, read использует service/query layer.
- [x] 4.4 Добавить server-side slug/SEO validation и стабильные state/slug/document/asset errors; выполнить `pnpm api:generate` и обновить committed OpenAPI/web generated outputs по действующему workflow.
- [x] 4.5 Покрыть тестами state transitions, required slug при draft create, GET DTO/permissions/404 lifecycle cases, metadata без snapshot, slug normalization/reserved values/collision и конкурентный slug collision на PostgreSQL.

## 5. Public read и assets

- [x] 5.1 Добавить явно `@Public()` read route по slug через узкий cross-table read query; вернуть snapshot title/SEO/schema/content и descriptors, не раскрывая приватных данных.
- [x] 5.2 Зафиксировать SSR mapping contract: content_json refs остаются asset IDs; API возвращает `resolverPath`, #53 разрешает его относительно настроенного absolute `http(s)` `NEXT_PUBLIC_API_BASE_URL` (API origin без path/query/fragment), не используя request Host; missing descriptor не используется как URL; rendering никогда не сохраняет resolver/signed URLs.
- [x] 5.3 Добавить public resolver с точным `302 Found`, пустым body, `Location` на signed URL и `Cache-Control: private, no-store, max-age=0` + `Referrer-Policy: no-referrer`; проверять current snapshot/cover, ready state и lifecycle до signing.
- [x] 5.4 Проверить anonymous security и uniform 404: private/чужой/старый snapshot asset, unpublished, deleted lifecycle, missing rendering, removed asset; response allowlist исключает Yjs, permissions, identity, storage key и uploader metadata.
- [x] 5.5 Проверить публикационный GC concurrency на PostgreSQL: publish-first удерживает current asset, GC-first отклоняет publish; проверить live/current snapshot/current cover retention, прежнюю version, unpublish и cover/content references.

## 6. Revalidation и интеграция #53

- [x] 6.1 Добавить leased `PublicationRevalidation` outbox с `FOR UPDATE SKIP LOCKED` claims, lease token/expiry, ACK/failure updates вне HTTP transaction и без page FK, чтобы pending invalidation переживал hard purge.
- [x] 6.2 Добавить optional `PUBLICATION_REVALIDATION_URL`, `PUBLICATION_REVALIDATION_TOKEN`, timeout через environment validation/ApplicationConfig и `apps/api/.env.example`; обновить CI config validation для отсутствующих/парных значений и запретить вывод секрета.
- [x] 6.3 Описать frontend #53 contract `POST /api/internal/revalidate` с event ID и canonical paths `/p/:slug`, idempotent revalidatePath и old+new slug; public API no-store и frontend public HTML без долгоживущего cache до подтверждённой revoke стратегии.
- [x] 6.4 Ограничить delivery attempt 10 секундами, HTTP timeout — максимум 5 секунд, lease — фиксированные 30 секунд; проверить, что config не может превысить bound, а поздний ACK/failure с истёкшим lease token не меняет новый claim; покрыть post-commit delivery, несколько instances, expiry/process restart, duplicate после remote success/local crash, capped exponential retry, отсутствие endpoint без claim/attempt increments и отсутствие отката committed publication.

## 7. Тестирование и завершение

- [x] 7.1 Добавить unit tests для management DTO/publicPath, state errors, resolverPath + configured API base URL (разные origins, игнорирование Host), projection allowlist, configuration pair validation и scheduler bounded timeout/no-endpoint behavior; real PostgreSQL tests для constraints/FK delete policy/rollback.
- [x] 7.2 Покрыть concurrent scenarios: publish/publish, publish/unpublish, direct/inherited revoke, page title rename, cover change, slug collision, soft delete subtree/project with multiple publications, publish/delete и publish/GC.
- [x] 7.3 Закрыть public acceptance scenarios: immutable captured content/revision, private/current/old asset references, exact 302 headers, SSR descriptor mapping, safe 404, no private response data, long-lived HTML cache prohibition.
- [x] 7.4 Проверить revalidation на `/p/:slug`: commit-only event, delivery deadline строго короче lease, multiple API instances, process restart lease recovery, remote success/local crash duplicate, late ACK rejection, no endpoint, retry logs and eventual invalidation after unpublish/delete.
- [x] 7.5 Проверить collaboration/snapshot/assets regressions и OpenAPI generation; выполнить `openspec validate add-backend-publications --strict`, relevant API tests, `pnpm lint`, `pnpm typecheck` и `pnpm build` перед завершением PR.
