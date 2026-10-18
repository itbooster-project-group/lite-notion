## 1. Database schema и migration

- [x] 1.1 Добавить Prisma `Asset`, `PageAssetGrant`, `PageAsset`, `PageAssetProjection`, `Page.coverAssetId` и минимальный `UserProfile(userId, avatarAssetId)` по schema v2 с описанными readiness nullable полями; `PageAssetProjection.sourceStorageRevision` допускает NULL до первой успешной projection и содержит только нужную retry metadata (`attemptedStorageRevision`, bounded `attemptCount`, `retryAfter`, `lastErrorCode`).
- [x] 1.2 Добавить `PageAssetGrant` composite key/FKs и composite reference из `PageAsset`; настроить FK restrict/cascade так, чтобы used asset нельзя было hard-delete или сослать page без grant.
- [x] 1.3 Добавить SQL CHECK для required metadata у ready asset, уникальность non-null storage key уже у pending key-intent и конкретные индексы pending cleanup, retention lookup, grant page lookup и projection rebuild; не добавлять publication таблицы.
- [x] 1.4 Создать additive migration; создать projection rows с `sourceStorageRevision=NULL` для существующих `PageDocument`, а новую page создавать в одной транзакции с `PageDocument` и успешным пустым watermark, равным фактической начальной storage revision; не переписывать существующие document revisions/snapshots.
- [ ] 1.5 Проверить Prisma validate/generate и migration на чистой PostgreSQL, включая PK/FK/check/index invariants и pending→ready metadata constraints.

## 2. Selectel S3 adapter и тестовые storage adapters

- [x] 2.1 Добавить напрямую в `apps/api` стандартные AWS SDK v3 packages для S3 operations и read URL presigning; не добавлять Selectel SDK, pool-specific config или storage provider factory.
- [x] 2.2 Реализовать узкий provider-independent S3 adapter для stream PutObject, HeadObject, presigned GetObject URL, DeleteObject и paginated ListObjectsV2 с endpoint/region/bucket/credentials/path-style config; не добавлять прямой backend GetObject без сценария и не опираться на ETag=MD5.
- [x] 2.3 Добавить in-memory test adapter с upload/read/delete/metadata и управляемыми ошибками для unit tests.
- [x] 2.4 Добавить test-only filesystem adapter для stream integration tests; каждому suite назначать свой `fs.mkdtemp(os.tmpdir())` directory и гарантировать recursive cleanup в teardown/finally.
- [x] 2.5 Проверить, что test adapters нельзя выбрать production env/config и что storage tests работают без сети, облачных credentials и Docker object-storage service.
- [ ] 2.6 Добавить storage portability test: при изменении endpoint/region/bucket/path-style меняется только S3 configuration/signed URL endpoint, Asset storageKey и бизнес-операции остаются provider-independent.

## 3. Asset lifecycle и streaming API

- [x] 3.1 Добавить Assets module, DTO/validators, error mapping, OpenAPI routes и application use-cases по текущим NestJS/CQRS/read conventions.
- [x] 3.2 Реализовать `POST /assets/uploads`: создать pending asset, серверный UUID и page/avatar context; для page context создать page grant с effective edit permission.
- [x] 3.3 Реализовать `PUT /assets/:assetId/content` как bounded raw stream: hard 10 MiB counter, небольшой process-local concurrent upload limit, per-request temp spool, backpressure, signature/MIME allowlist, SHA-256, sanitized display filename и cleanup в `finally`.
- [x] 3.4 При initiate commit-ить unique storageKey; перед каждым Put (включая первый) атомарно ротировать key только для pending, затем Put/Head и условно переводить pending→ready только при совпадении attempt key.
- [x] 3.5 Реализовать failed state для невалидного содержимого, retryable pending для временного S3/DB сбоя, conflict для upload в ready asset и cleanup истёкших pending uploads; не удалять object после DB error/unknown outcome без positive DB reconciliation.
- [x] 3.6 Реализовать context-bound metadata/read URL, idempotent delete, cross-page grant для uploader/editor, cover set/remove и own-avatar set/remove; не возвращать storage key.
- [ ] 3.7 Проверить upload/delete/API сценарии: invalid/oversized body, S3 missing/error, DB rollback after Put, commit-success/response-timeout ambiguous commit (после reconciliation ready object остаётся, DeleteObject не вызывается), DB unavailable during reconciliation, retry, concurrent attempts, ready overwrite, repeat delete и pending cleanup.

## 4. Permissions и attachment eligibility

- [x] 4.1 Переиспользовать существующий effective page permissions flow для page-context upload, grant, document write, cover, metadata и signed read; не копировать role inheritance.
- [x] 4.2 Разделить upload, attach, read и delete права: editor upload/attach, viewer read только при фактической reference, asset uploader выдаёт новые page grants, avatar change только self, avatar read для authenticated user.
- [x] 4.3 Проверять `PageAssetGrant` и ready status в post-persistence projection; ungranted/foreign ID не получает PAGE_ASSETS/read access, при этом Hocuspocus live-synced Y.Doc не отклоняется из-за projection validation.
- [ ] 4.4 Проверить direct asset ID IDOR, cross-page reuse без grant, grant uploader/editor rules, access editor/viewer, отсутствие прав, avatar context и невозможность обхода permissions через ownership/reference.

## 5. PAGE_ASSETS projection и initial rebuild

- [x] 5.1 Расширить только общий Document Projection boundary из #97 versioned schema v2 для asset image source; сохранить v1 external contract и общий frontend/backend fixture, не создавать Assets Yjs decoder.
- [x] 5.2 Укрепить общий API document write path expected-storageRevision CAS: collaboration load получает вместе с bytes их persisted revision; при конфликте API возвращает latest persisted bytes/revision, collaboration под save mutex применяет persisted Yjs update в live document и ограниченно повторяет write; затем вызывать общий #97 projection на exact committed bytes/schema и атомарно обновлять PAGE_ASSETS set + successful watermark.
- [x] 5.3 Реализовать revision guards: projection lock PageDocument, сверяет current storage_revision с target, затем locks Asset; stale N не меняет N+1. Projection DB/eligibility error после document commit не меняет старый set/marker, записывает stale diagnostics и не превращается в Hocuspocus persistence error.
- [x] 5.4 Свести все существующие document write paths к общему API persistence/projection контракту: Hocuspocus `onStoreDocument`, #93 capture и любой доступный `PageDocument` replacement use-case используют CAS; page creation атомарно создаёт projection row. Сохранить общий #97 decoder без API→collaboration зависимости; document persistence failure остаётся ошибкой Hocuspocus, asset eligibility failure — нет. Добавить PostgreSQL integration test двух writers, где устаревший expected revision не меняет persisted bytes/revision, затем Yjs merge сохраняет обе ветки updates.
- [ ] 5.5 Реализовать resumable one-off initial rebuild существующих документов через #97; создать marker только для exact current revision и не включать page upload на page с missing/stale marker.
- [ ] 5.6 Проверить projection scenarios: v1 compatibility, v2 refs, invalid/unknown schema, ungranted ref без отказа persistence, add/remove, duplicates по nodeId, empty document, новая страница сразу разрешает editor upload без rebuild, CAS conflict + Yjs merge, старая capture после новой revision, Hocuspocus saveMutex/capture serialization, concurrent ordering N/N+1, projection rollback после committed document write, stale diagnostics и initial rebuild.
- [x] 5.7 Добавить ограниченный автоматический retry/rebuild stale projection через существующий Nest scheduler: bounded batch; #97 decoder; exact persisted bytes; revision guards; capped exponential backoff; suppression permanent errors для той же revision; остановка после retry exhaustion и диагностика/manual recovery.
- [ ] 5.8 Добавить scheduler tests на восстановление projection после временной ошибки без новых document writes, пропуск stale revision при появлении новой, backoff/bounded attempts, permanent error suppression, retry exhaustion и отсутствие перезаписи более нового watermark.

## 6. Retention и page-scoped garbage collection

- [ ] 6.1 Реализовать retention queries для `PAGE_ASSETS`, page covers, profile avatars и extension point для активной publication snapshot из #52; `PageAssetGrant` не считать удерживающей reference.
- [x] 6.2 Реализовать GC per asset: получить grant page set, lock только эти documents по UUID, затем asset row, перечитать grant set и повторить transaction если set изменился.
- [ ] 6.3 Проверять revision marker каждой grant page под locks; stale page откладывает только соответствующий asset и создаёт warning/metric после configured age.
- [x] 6.4 В одной transaction повторно проверить refs, пометить asset deleted и убрать grants; после commit выполнить повторяемый S3 delete. DB rollback не должен запускать physical delete.
- [x] 6.5 Реализовать bounded scheduled cleanup для pending/failed/deleted assets и rotated orphan attempt keys по managed prefix/grace; DB state unknown/error всегда откладывает DeleteObject, все deletes после tombstone/positive reconciliation; не вводить новый queue/job framework.
- [ ] 6.6 Добавить PostgreSQL concurrency tests для document write/create, grant, cover/avatar assignment, projection, logical delete и GC; проверить stale marker barrier, lock order, отсутствие global PageDocument lock и удаления committed/used key.

## 7. Tests и обязательный CI

- [ ] 7.1 Выполнять unit tests на in-memory adapter с failure injection, а PostgreSQL integration tests — на per-suite filesystem adapter.
- [x] 7.2 Обновить required API CI: локальная PostgreSQL service, Prisma schema/migration checks, unit/integration/permissions/projection/GC concurrency suites, lint, typecheck, build и OpenAPI validation.
- [x] 7.3 Убедиться, что required CI не использует Selectel credentials, внешний S3 или object-storage Docker service.
- [x] 7.4 Добавить отдельный ручной/deployment Selectel smoke workflow: dedicated test bucket или explicit isolated prefix, unique run key, configured endpoint/credentials, PutObject/HeadObject/presigned GET и реальный GET bytes без AWS credentials/DeleteObject/Head-404, cleanup в finally и запрет доступа к production asset prefix.
- [x] 7.5 Документировать и обеспечить smoke test как release prerequisite перед первым production deployment; он не должен быть required PR CI.

## 8. Documentation и финальная проверка

- [x] 8.1 Обновить `apps/api/.env.example` и инструкции Selectel config/local bounded upload/temp-file cleanup; не добавлять обязательное object storage в Docker Compose.
- [x] 8.2 Документировать endpoints, permissions/grants, upload limits, lifecycle retries, initial rebuild, stale diagnostics, GC recovery и manual S3 smoke procedure.
- [x] 8.3 Документировать ручную S3 provider migration: pause uploads/deletes, copy preserving keys, count/key/size/SHA-256 checks, compatibility smoke, config switch, verify reads/uploads, rollback window; не реализовывать dual-provider/hot migration.
- [x] 8.4 Сверить migration/API/OpenAPI с `docs/database-schema-v2.md`, отдельно проверить pending storageKey intent, readiness metadata и `PageAssetGrant` diff.
- [ ] 8.5 Проверить совместимость #49 (обычный backend upload, assetId в Y.Doc), #51 (общая projection), #52 (snapshot retention), #53 (private signed read context) и provider switch без реализации будущих задач.
- [ ] 8.6 Подготовить все изменения единым PR по #47; оставить implementation tasks незакрытыми до реализации и проверок.
