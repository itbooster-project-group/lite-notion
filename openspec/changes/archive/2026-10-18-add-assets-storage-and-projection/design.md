## Context

См. `proposal.md` для мотивации и `specs/` для контрактов. В `main` уже есть NestJS/Prisma/PostgreSQL, effective page permissions, Hocuspocus persistence с `PageDocument.storageRevision`, snapshot infrastructure из #93 и общий schema-aware Document Projection из #97. Projection v1 поддерживает external media, но не внутренние asset IDs. `PageDocument` write path увеличивает revision; projection, asset tables и page/profile asset references ещё не реализованы.

Источник целевой модели — `docs/database-schema-v2.md`; фактическая Prisma schema и migrations подтверждают, что Asset модели пока отсутствуют. Snapshot-модели и код из #93 уже существуют, хотя вводный статусный абзац документа v2 это не отражает. Документ v2 допускает минимальный optional `USER_PROFILES` только для avatar; пользователь подтвердил `userId + avatarAssetId` без остальных полей профиля.

## Goals / Non-Goals

**Goals:** private S3-compatible storage (первоначально Selectel), bounded backend streaming upload, explicit page-scoped eligibility для media references, revision-safe post-persistence projection и безопасный GC без глобальной блокировки документов.

**Non-Goals:** Selectel-specific SDK, обязательный S3 emulator в CI, production filesystem storage, frontend, search indexing, publication tables/pipeline и public rendering.

## Decisions

### 1. Production storage: стандартный S3 API и Selectel config

`AssetsModule` использует одну узкую object-storage границу. Production implementation — AWS SDK for JavaScript v3: `@aws-sdk/client-s3` для `PutObject`, `HeadObject`, `DeleteObject`, `ListObjectsV2`; `@aws-sdk/s3-request-presigner` для краткоживущего signed `GetObject` URL. Приложение не скачивает object bytes в обычном API flow. Upload подписанные URL не создаются. В коде и доменной модели нет Selectel SDK, pool name или условий на `ru-6`: endpoint, region, bucket, credentials и path-style задаются конфигурацией.

Bucket private; credentials доступны только API. API никогда не раскрывает key. Signed read URL создаётся динамически для текущей конфигурации только после авторизации и проверки готового asset, действует короткое время (рекомендуемо 60 секунд), имеет только GET. В Asset, Y.Doc и snapshots хранится только provider-independent `storageKey`, никогда — endpoint, bucket, region или публичный URL. ETag не считается содержимым checksum: SHA-256 вычисляется API при upload и сохраняется в Asset; для migration проверяются фактические bytes подходящим read/download способом. Выбор Selectel standard storage или multi-AZ `ru-6` остаётся настройкой инфраструктуры Selectel; приложение не знает storage pool.

ObjectStorage boundary ограничена используемыми операциями: stream Put, Head/metadata, private signed-Get URL, Delete, paginated List только для reconciliation. Прямой backend GetObject не нужен: клиент читает bytes по выданной URL. Доменная логика не ветвится по провайдеру и не получает AWS SDK types. Уникальность server-generated key enforced БД и UUID attempt generation; key всегда immutable после `ready`.

#### Ручная смена S3-compatible провайдера

Это операционная maintenance procedure, не migration feature: временно приостановить новые uploads и физическое удаление; скопировать objects в новый bucket, сохранив каждый storageKey; сверить количество, ключи, размеры и сохранённый SHA-256 по фактическим bytes (не предполагать, что ETag — MD5); выполнить compatibility smoke для Put/Head/presigned GET/реального GET/Delete; переключить endpoint/region/bucket/credentials/path-style; проверить чтение старых assets и новый upload; затем возобновить uploads и GC. Исходные objects не удалять до успешной проверки и безопасного rollback периода. При одинаковых keys менять Asset rows в PostgreSQL не нужно. Переключение требует maintenance window: одновременная работа двух активных providers, dual write, automatic failover и hot migration не поддерживаются.

Env names: `ASSETS_S3_ENDPOINT`, `ASSETS_S3_REGION`, `ASSETS_S3_BUCKET`, `ASSETS_S3_ACCESS_KEY_ID`, `ASSETS_S3_SECRET_ACCESS_KEY`, `ASSETS_S3_FORCE_PATH_STYLE`, `ASSETS_S3_REQUEST_TIMEOUT_MS`, `ASSETS_READ_URL_TTL_SECONDS`, `ASSETS_MAX_UPLOAD_BYTES`, `ASSETS_MAX_CONCURRENT_UPLOADS`, `ASSETS_PENDING_TTL_HOURS`, `ASSETS_ORPHAN_GRACE_HOURS`, `ASSETS_GC_INTERVAL_SECONDS`, `ASSETS_GC_BATCH_SIZE`, `ASSETS_PROJECTION_STALE_WARNING_SECONDS`, `ASSETS_GC_ENABLED`. S3 request timeout is finite, and orphan grace MUST exceed the maximum bounded upload/request lifetime so an in-flight old attempt cannot finish after reconciliation has swept its key. Secrets are added only in production/deployment secret store. Production DI always selects S3 adapter; test adapters are wired only through test module override, never an env switch.

### 2. Backend streaming upload с disk spool и заранее зарегистрированным attempt key

Upload состоит из двух API запросов, без presigned PUT и без finalize:

```text
POST /api/v1/assets/uploads       → создать pending Asset и контекстный grant
PUT  /api/v1/assets/:id/content   → stream → bounded temp file → validate → S3 Put + Head
                                                   → pending становится ready
```

Initiate принимает только контекст (`pageId` либо avatar для текущего пользователя) и безопасное display filename. `assetId` и все storage keys генерирует backend. Для page context initiate требует effective editor permission и транзакционно создаёт `PageAssetGrant`; аватарный контекст не создаёт page grant. Endpoint content принимает один raw image body, не multipart path/filename. Фактический объём считается по потоку, а не по `Content-Length`; при превышении 10 MiB чтение прекращается. Чтобы не держать до 10 MiB на каждый concurrent request в RAM, API использует индивидуальный каталог из `fs.mkdtemp(os.tmpdir())`, ограниченный disk stream, backpressure, режим доступа только владельцу процесса и `finally` cleanup. Путь не включает клиентское имя.

Число параллельных upload streams ограничивается небольшим process-local лимитом `ASSETS_MAX_CONCURRENT_UPLOADS`; при исчерпании лимита API быстро отвечает retryable 503 до создания temp file. После завершения spool проверяются сигнатуры JPEG/PNG/WebP, вычисляется SHA-256, заявленный `Content-Type` сверяется с фактическим, а неподдерживаемый файл переводит `pending -> failed`. `storageKey` генерируется и сохраняется при initiate. После полного spool/validation каждый content request, включая первый и retry, транзакционно claim-ит попытку сменой pending key на новый UUID key до `PutObject`; конкурентные requests поэтому не получают один key. Затем API пишет temp file по claim key, делает `HeadObject` и сверяет размер/content type и доступные checksum metadata. Только после этого условный переход `pending -> ready` сохраняет проверенные metadata и тот же key. Ключ не меняется после `ready`.

Каждая попытка использует уникальный никогда не переиспользуемый key, заранее committed как текущий ключ pending asset. Перед каждым `PutObject` backend условно меняет pending key на новый key и получает его как claim; последующий запрос меняет key снова, поэтому предыдущий конкурент теряет право finalize. Finalize переводит в ready только при совпадении статуса и claimed key. Конкурирующий проигравший key становится orphan, но ready key не перезаписывается. Удалять проигравший/orphan object сразу после ошибки запрещено: PostgreSQL cleanup может удалить key только после успешной авторитетной сверки с БД и истечения bounded request lifetime. Повторный upload для `ready` отклоняется без S3 write.

Temp directory всегда удаляется в `finally`, включая ошибки валидации, S3 и PostgreSQL. При аварийном завершении процесса локальный temp файл не может быть очищен приложением; он не считается asset, не раздаётся клиенту и очищается ОС/временным каталогом хоста. Storage key содержит только серверные UUID, клиентские пути не принимаются.

Это намеренно проще прямой передачи browser→S3: #49 получает обычный API upload и не требует S3 SDK, а сервер может ограничить, проверить и потоково hash-ировать bytes до storage write. Цена — один временный disk spool и дополнительный API bandwidth. Лимит 10 MiB удерживает диск/время ограниченными; универсальный upload framework и новые lifecycle states не нужны.

### 3. Lifecycle и частичные сбои

`Asset` создаётся pending с уже committed уникальным `storageKey`; `mimeType`, `sizeBytes` и `checksum` остаются nullable до подтверждённого object write. Это key-intent: ни один upload не начинается до фиксации ключа в PostgreSQL. `originalName` — display metadata, очищенное от path separators/control characters. `pending -> ready` выполняется только после валидации stream и успешных Put/Head. Retry pending меняет key перед записью; ready key неизменяем. Невалидный файл переводит в failed; transient storage/DB failure оставляет pending до retry/TTL.

Upload initiation не обещает exactly-once: повторный POST может создать второй pending asset. Идемпотентны delete, assignment одного и того же cover/avatar и grant upsert. Повторная загрузка в ready asset возвращает conflict и ничего не пишет. Это исключает idempotency-key table ради необязательной exactly-once upload semantics; лишний pending asset безопасно удаляется GC.

Ready asset удаляется только явным запросом uploader-а в MVP. Это осознанно: в #47 нет API asset library/list, а frontend #49 может держать загруженный asset до прикрепления; TTL GC такого неиспользуемого ready asset мог бы удалить ожидаемую загрузку. Delete конфликтует при существующих references. После проверки use-case блокирует grant pages и asset, перепроверяет refs, записывает tombstone `deleted`, затем после commit физически удаляет object. Pending/failed assets очищаются после TTL; их известные keys остаются в БД до tombstone.

Для любого физического delete требуется положительная проверка: PostgreSQL transaction/row lock подтверждает, что key принадлежит `deleted` Asset и ни одна ready Asset не использует его, либо успешный DB lookup подтверждает отсутствие строки с этим key для старого attempt key. При ошибке/timeout/недоступной БД cleanup откладывается; unknown не трактуется как absent. Если `PutObject` успешен, а finalize commit вернул timeout, немедленный `DeleteObject` запрещён. Key-intent уже committed до S3 write, поэтому reconciliation блокирует строку Asset и после разрешения транзакции увидит `ready` и сохранит object либо `pending` и выполнит retry/TTL cleanup. `failed` сначала должен получить committed tombstone `deleted`; только затем разрешено физическое удаление. Повторная reconciliation идемпотентна. Если неизвестен сам исход начального key-intent commit, `PutObject` не запускается.

Любой S3 DeleteObject выполняется после commit DB tombstone либо после успешной сверки orphan key. DB failure никогда не запускает физическое удаление. Ошибка S3 оставляет tombstone/key для повтора; deleted asset никогда не получает signed URL.

### 4. Test adapters и CI

Нужны оба маленьких test adapter, но ни один не является production service:

- In-memory adapter для быстрых unit tests, фикстур metadata и детерминированного error injection.
- Temporary filesystem adapter для DB integration tests: suite/test создаёт уникальную директорию через `fs.mkdtemp(os.tmpdir())`, adapter реализует stream write/read/head/delete/list; cleanup делает `afterEach`/`finally` с recursive `rm`. Изолированный каталог предотвращает гонки параллельных suites. Adapter не подключён к production config.

Это дешевле полноценного S3 emulator и покрывает разные нужные свойства: тестирование сценариев/ошибок и реальное чтение/удаление stream bytes из FS. При такой границе unit tests не зависят от диска, а integration tests проверяют DB transactions с настоящим storage persistence.

Обязательный CI API job запускает PostgreSQL service локально через GitHub Actions service, Prisma validate/generate/migration deploy, unit и integration suites с filesystem adapter, permission/projection/GC concurrency tests, lint, typecheck, build и OpenAPI validation. Никакого Selectel credential или S3 container в required PR CI нет. Existing API CI сейчас использует `DATABASE_URL` secret; его нужно заменить/переопределить локальной PostgreSQL service для integration tests.

Отдельный ручной Selectel smoke workflow использует dedicated test bucket или строго изолированный prefix и отдельные `ASSETS_S3_SMOKE_*` secrets. Он генерирует уникальный run key, проверяет configured endpoint/credentials через PutObject, HeadObject, presigned GET (реальный HTTP GET без AWS credentials и сверка полученных bytes), DeleteObject и последующий Head 404; cleanup в `finally` удаляет созданные keys. Обычный production prefix недопустим. Workflow не подключён к PR CI. Filesystem tests не доказывают S3 compatibility; успешный smoke test обязателен перед первым production deployment.

### 5. Минимальная page-scoped attachment eligibility

Одних `ready` status и `assetId` недостаточно: произвольная ссылка в Y.Doc могла бы открыть чужой объект через разрешённый page context. Добавляется `PageAssetGrant(pageId, assetId, createdAt)` — конкретное разрешение использовать asset в page. Это не retention reference и не универсальная ACL.

- Upload initiate с page context требует effective editor и создаёт grant для uploader-ом созданного pending asset. Content upload повторно проверяет page edit access перед переходом в ready.
- Повторное использование в той же странице разрешено всем текущим editors этой страницы: uploader явно выдал page-scoped grant при upload.
- Для новой страницы asset uploader с effective editor permission на целевой page выполняет `POST /pages/:pageId/assets/:assetId/grant`; другие page editors не могут расширить grant на страницу, пока не являются uploader-ом.
- `PageAsset` имеет составную ссылку на `PageAssetGrant(pageId, assetId)` и сохраняет occurrence по `(pageId, assetId, nodeId)`. Post-persistence projection проверяет одновременно grant и `Asset.status=ready`. Негрантованный, pending, failed или deleted ID не попадает в PAGE_ASSETS; документ остаётся persisted, projection marker — stale, а metadata/read URL fail closed.
- Grant не даёт права читать страницу или object напрямую. Metadata/read для page media требуют page permission и grant; viewer дополнительно требует `PAGE_ASSETS` occurrence и свежий marker (`PageAssetProjection.sourceStorageRevision == PageDocument.storageRevision`). При stale marker signed URL для document media fail closed до projection recovery, чтобы старый occurrence не выдавал уже удалённый из текущего документа asset. Cover проверяется по текущему `Page.coverAssetId`, avatar — через собственный `UserProfile.avatarAssetId`; любой authenticated user может читать только текущий avatar по profile context. Ownership не обходит page access.
- Grant не удерживает объект от GC. После удаления asset его grants удаляются; наличие любого live `PAGE_ASSETS`, cover/avatar или будущей publication reference удерживает объект.

`PageAssetGrant` ограничивает область повторного использования и даёт GC полный список pages, где конкретный asset вообще может появиться. Это ключевой bounded set вместо сканирования/блокировки всех документов.

### 6. Schema v2 diff и constraints

Документация schema v2 уже описывает `ASSETS`, `PAGE_ASSETS`, `PAGE_ASSET_PROJECTIONS`, `PAGES.cover_asset_id` и optional `USER_PROFILES`; фактические Prisma schema/migrations этих asset structures пока не содержат. Первая migration реализует предусмотренную v2 модель в приложении. Дополнительное отличие от v2 — page-scoped eligibility grant и nullable readiness metadata для pending lifecycle:

| Структура и отличие от schema v2 / фактической Prisma | Требование, инвариант и причина | Migration / #52 |
|---|---|---|
| Реализовать в Prisma предусмотренный v2 `Asset`/status enum/fields; `storageKey` unique и NOT NULL с pending key-intent; `mimeType/checksum/sizeBytes` nullable до ready | Таблица/модель есть в target v2, но отсутствует в фактической Prisma. Key-intent нужен для reconciliation до S3 Put; pending metadata ещё не проверена, ready требует key/type/checksum/size | Да: реализовать отсутствующую v2-модель и readiness nullability/CHECK; индексы `(uploadedById, deletedAt)` и `(status, createdAt)` для cleanup/lookups |
| Новая `PageAssetGrant` с PK `(pageId, assetId)`, timestamps, FK на Page/Asset | Target v2 не задаёт eligibility boundary между произвольным `assetId` в Y.Doc и страницей. Grant ограничивает attach/reuse и делает GC page set конечным; не удерживает asset | Да: новая таблица, FK restrict на Asset/cascade на Page и index `(assetId)` |
| Реализовать предусмотренный v2 `PageAsset` PK `(pageId, assetId, nodeId)`; добавить composite FK `(pageId, assetId) -> PageAssetGrant` | Target v2 описывает occurrences, но не enforced page eligibility; фактическая модель отсутствует | Да: реализовать v2-таблицу и добавить FK на новый grant; asset FK restrict |
| Реализовать предусмотренную v2 `PageAssetProjection` | Нужен успешный watermark, stale barrier и bounded recovery. Для восстановления после рестарта без частых повторов дополнительно хранятся `attemptedStorageRevision`, `attemptCount`, `retryAfter`, `lastErrorCode`; `sourceStorageRevision` допускает NULL до первой успешной projection | Да: реализовать v2-таблицу и retry metadata; индексировать очередь stale rows только если этого требует фактический bounded scan |
| Реализовать предусмотренный v2 nullable `Page.coverAssetId` FK -> Asset | Target v2 уже предусматривает cover, фактическое поле Prisma отсутствует | Да: реализовать v2 field/FK и retention lookup index |
| Минимально реализовать optional v2 `UserProfile(userId PK, avatarAssetId nullable FK)` | Target v2 уже разрешает optional profile/avatar; фактическая модель отсутствует. Не создавать username/bio/timezone/locale | Да: только минимальная model/FK и retention lookup index |

`storageKey` уже NOT NULL/unique в целевой v2; migration сохраняет эту invariant. При committed initiate key-intent уже существует; каждый content request меняет key только пока Asset остаётся pending, до следующего S3 write. Для ready row key immutable. Repository предоставляет условные операции claim/rotate-pending-key и `pending -> ready`; отдельной операции изменения key ready asset нет. S3 key никогда не переиспользуется. PostgreSQL хранит tombstone и не удаляет Asset row физически. `PageDocument.storageRevision` и текущие document fields уже существуют, поэтому эта migration их не меняет.

FK actions на retention references — `RESTRICT`, page children/occurrence rows — cascade вместе с фактическим purge страницы. `PageAssetGrant` не является retention; его FK на asset остаётся до logical delete, где grant удаляется транзакционно.

Не добавлять `DocumentSnapshot`, `SnapshotAsset`, publication или полный профиль: snapshot persistence из #93 уже есть, immutable publication retention относится к #52.

### 7. API и permission contracts

Все routes — `/api/v1`, существующие auth guards, DTO validation, error mapping и OpenAPI conventions. Рекомендуемый минимум:

| Операция | Endpoint | Authorization |
|---|---|---|
| Создать pending upload | `POST /assets/uploads` с `{context: page/avatar, originalName}` | Auth; page context требует effective editor. Для avatar — current user |
| Передать file stream | `PUT /assets/:assetId/content` (`Content-Type: image/*`, raw bytes) | Только uploader pending asset; page grant/permission повторно проверяются до ready |
| Metadata | `GET /assets/:assetId?context=page:<id>` или avatar user context | Page permission + grant; viewer требует live ref, uploader/editor grant может получить draft metadata. Avatar reader — authenticated, если asset совпадает с profile avatar |
| Signed read URL | `POST /assets/:assetId/read-url` с typed context | Та же проверка; только ready; около 60 секунд |
| Delete | `DELETE /assets/:assetId` | Uploader и отсутствие references; иначе conflict. Идемпотентен |
| Выдать grant на повторное использование | `POST /pages/:pageId/assets/:assetId/grant` | uploader asset + effective page editor; повтор идемпотентен |
| Установить/снять cover | `PUT/DELETE /pages/:pageId/cover` | effective page editor + page grant для установки |
| Установить/снять свой avatar | `PUT/DELETE /users/me/avatar` | только current user, asset uploader |

Page media nodes редактируются обычным collaboration flow; новый grant endpoint даёт eligibility, но не создаёт content reference. Asset eligibility не валидируется как условие Y.Doc write: любой assetId может попасть в уже live-synced Y.Doc, однако без page grant он не создаёт `PAGE_ASSETS` reference и не получает metadata/read URL. Signed read выдаётся только для авторизованного context; bucket никогда не становится публичным.

Все writes идут через use-cases. Metadata/read queries используют существующий read pattern. Page role resolution переиспользует `PagePermissionsService`; Assets не дублирует inheritance алгоритм.

### 8. Persisted PAGE_ASSETS projection и revision safety

Projection v2 расширяет общую boundary из #97, а не создаёт Assets decoder. Schema v1 external image contract сохраняется; schema v2 добавляет `{type:'asset', assetId}`. Одна pure projection строит canonical JSON и references из одинаковых persisted bytes/schema.

**Document persistence остаётся в `apps/collaboration` как Hocuspocus `onStoreDocument` capture → internal API `PUT`; authoritative write и `storage_revision` остаются в `apps/api` `PageDocumentRepository`. Assets validation/projection не встраивается в live Hocuspocus hooks.** Hocuspocus уже применил и синхронизировал CRDT update перед `onStoreDocument`. Поэтому reject API write из-за ungranted asset ID оставил бы live state у подключённых клиентов, но не в PostgreSQL. Выбирается существующий post-persistence boundary:

1. Hocuspocus 4.7.0 вызывает `onStoreDocument` внутри `document.saveMutex`; #93 `DocumentCapture.persistLiveState` также держит тот же mutex и кодирует Y.Doc уже внутри критической секции. Это гарантирует порядок и свежий capture только для одной live `Document` в одном collaboration process. Redis extension берёт Redlock вокруг обычного store hook между репликами и освобождает его в `afterStoreDocument`, но прямой API write из #93 capture обходит этот lock. Сам mutex/Redlock не защищает от старого full-state capture, пришедшего после нового write из другого process.
2. Поэтому внутренний document write использует optimistic compare-and-swap по `expectedStorageRevision`, а не безусловное `replaceYjsState`: загрузка collaboration сохраняет revision базового persisted state рядом с live document; успешный CAS возвращает новый revision. При конфликте API возвращает актуальные persisted bytes/revision, collaboration под `saveMutex` применяет эти Yjs bytes к live Y.Doc и повторяет ограниченное число раз с новым expected revision. Это Yjs merge средствами уже существующего collaboration runtime, не второй decoder. Hocuspocus store и #93 capture используют один этот путь. CAS не позволяет захвату на базе старой revision затереть committed state; page creation остаётся отдельным атомарным write и создаёт пустой document + projection marker.
3. API выполняет conditional document write и получает committed `storage_revision` N. Любая другая операция замены документа должна использовать тот же CAS/persistence path.
4. После успешного document commit API вызывает общий Document Projection #97 для exact сохранённых bytes/schema. Assets eligibility для каждого asset reference проверяется по ready status и `PageAssetGrant` в projection transaction; никакой внешний client state не декодируется отдельно.
5. Projection transaction блокирует `PageDocument FOR UPDATE`, проверяет, что текущий `storage_revision` всё ещё N и marker не новее N, затем блокирует referenced `Asset` rows в UUID порядке, повторно проверяет eligibility, заменяет полный occurrence set и записывает marker N в одной transaction. Пустой документ очищает set. Повтор N идемпотентен.
6. Если уже сохранена N+1, обработка N становится no-op/stale retry и не может откатить references/marker. Projection commit atomic для `PAGE_ASSETS + marker`; document commit уже состоялся отдельно.

Границы модулей: `apps/collaboration` владеет Hocuspocus live document, capture, base revision и ограниченным CAS-conflict merge/retry через internal HTTP boundary; он не импортирует Assets module, Prisma repositories или projection decoder. `apps/api` владеет authenticated/effective permissions, CAS и `PageDocument` persistence/revision, projection orchestration/transaction, PAGE_ASSETS repository и rebuild command. API повторно использует один существующий `PageDocumentRepository` и Document Projection #97; обратной API→collaboration зависимости нет. Фактические write entrypoints: Hocuspocus `onStoreDocument` и #93 `DocumentCapture` вызывают internal `PUT /internal/pages/:id/document`; endpoint проходит через `PersistPageDocumentStateUseCase` и CAS repository method. Page creation вызывает `insertEmpty` и должен атомарно создать projection row с отсутствующим успешным watermark. `PageDocumentService.replace` сейчас не подключён к controller; если он остаётся доступным write path, его надо направить через тот же persistence/projection orchestration, а не писать в repository в обход. Snapshot #93 в текущем коде захватывает live document, но не восстанавливает его.

Невалидный/чужой `assetId`, pending/deleted asset, decoder error или unknown schema **не отклоняет уже применённый и live-synced update и не сообщает collaboration, что document persistence не состоялась**. API коммитит Y.Doc как обычное состояние документа. Если общий projection decoder не может разобрать document либо eligibility не пройдена, API сохраняет прежние `PAGE_ASSETS`/успешный watermark без частичной замены, фиксирует диагностическое состояние stale отдельно, а page media signed reads fail closed, пока watermark не станет текущим. Unauthorized ID также не получает metadata/read URL по прямому `assetId`. Исправление документа или schema и rebuild остаются обычными document/recovery действиями. Это сохраняет live/persisted Y.Doc convergence и fail-closed доступ без CRDT rollback framework.

Альтернатива — fail-closed asset validation до `PageDocument` commit — отклонена: фактический Hocuspocus hook вызывается после применения update к live Y.Doc и его синхронизации с peers. Такой reject оставил бы live state новее persisted state, а согласованное откатывание CRDT updates потребовало бы отдельной синхронизации/framework. Asset validation выполняется только на post-persistence projection/read boundary. Отдельные ошибки самого document persistence (например, DB/CAS exhaustion или лимит размера) остаются ошибками persistence по существующему Hocuspocus контракту; это не asset eligibility rejection.

При DB failure document write остаётся uncommitted; Hocuspocus получает ошибку по существующему контракту, live document остаётся в памяти и следующий store/capture повторяет текущий state. Ограниченные автоматические retries projection относятся только к committed document и не превращают eligibility/schema errors в Hocuspocus errors. После process crash незакоммиченный live state восстановить нельзя — существующая граница durability Hocuspocus.

CAS и page row lock сериализуют committed document revision; ожидаемая revision защищает от позднего старого full state, а collaboration merge-ит конфликтующий persisted Yjs update в live CRDT до повторной попытки. Hocuspocus `saveMutex` остаётся внутрипроцессной сериализацией `onStoreDocument` и #93 capture; Redis extension Redlock остаётся межрепличной сериализацией обычных store hooks, но correctness больше не зависит от того, проходит ли write через Redis hook. Projection получает ту же page row lock и повторно проверяет revision. Asset status/grant перепроверяются под `Asset` lock до projection replacement. PAGE_ASSETS rows и успешный watermark всегда меняются вместе. При projection error старые rows остаются, watermark отстаёт; GC использует stale watermark как retention barrier.

### 9. Page-scoped GC synchronization без global document lock

Global lock/scan всех `PageDocument` rows не используется. Для asset page grant задаёт полный перечень страниц, на которых этот asset может легально встретиться. GC/delete проверяют только эти страницы. Новая page создаётся с заведомо пустым Y.Doc: одна транзакция создаёт `PageDocument` и `PageAssetProjection` с успешным пустым watermark, равным фактическому начальному `PageDocument.storageRevision`. Поэтому editor может сразу инициировать page-context upload/grant без ожидания rebuild. Для существующих при migration страниц `sourceStorageRevision=NULL` сохраняется до успешного initial rebuild; grant нельзя создать для page без document и свежей projection.

Lock order для document persistence, grant/cover assignment, projection и GC единый: затронутые `PageDocument` row locks по page UUID, затем `Asset` row locks по asset UUID. Avatar update/delete берёт только `Asset` затем `UserProfile`, не захватывая page rows.

Для ready asset candidate появляется только после explicit delete request; TTL не удаляет unreferenced ready assets, потому что #47 не имеет asset library API, а #49 может ещё прикрепить уже загруженный asset. Pending/failed кандидаты появляются после upload TTL. Для кандидата GC:

1. Прочитать текущие `PageAssetGrant` page IDs для asset.
2. В транзакции заблокировать только соответствующие `PageDocument` rows в стабильном порядке (missing document считается stale), затем `Asset` row.
3. Повторно прочитать grant set под asset lock. Если с момента initial read появился grant page без взятой document lock, rollback и повторить с новым полным набором. Grant creation также сначала блокирует целевой document, затем asset; поэтому при GC asset lock новые grants либо уже committed и обнаруживаются в повторном read, либо после lock увидят deleted и отклонятся.
4. Для каждого grant page убедиться, что projection marker равен текущей `storage_revision`. Так GC видит окно между document commit и post-persistence projection и не удаляет asset, пока projection неизвестна. При stale/missing marker отложить только этот asset; не блокировать GC других assets.
5. Под теми же locks проверить `PAGE_ASSETS`, page cover, avatar и будущие publication retention; если references нет — установить `deleted`, удалить grant rows и commit.
6. После commit вызвать S3 DeleteObject. Повторять физическое удаление по deleted tombstone; DB failure никогда не запускает физический delete.

Document persistence берёт `PageDocument FOR UPDATE` в транзакции storage revision; затем projection под той же page lock сериализуется с GC. Если document commit произошёл первым, marker становится stale до projection completion и GC отступает. Если GC первым фиксирует tombstone, последующая persisted document может содержать старый id, но projection eligibility/read URL остаются fail-closed; media node не может раскрыть удалённый объект. Новый grant после tombstone отклоняется. Новая page не может получить references без grant, а grant невозможен до commit page/document creation. Ни поздняя projection, ни asset ID сами по себе не возвращают deleted object к жизни.

`PageAssetGrant` не удерживает файл: stale watermark блокирует GC конкретного asset, только если grant указывает на такую page. После восстановления projection GC проверяет действительные refs и продолжает. #52 добавит `SnapshotAsset`/active publication cover к тому же reference check и будет брать соответствующий asset lock перед публикацией; оно не меняет upload/lifecycle.

### 10. Initial projection rebuild и stale recovery

У всех существующих страниц после migration успешный watermark отсутствует. Миграция создаёт `PageAssetProjection` row для каждого существующего `PageDocument` с `sourceStorageRevision=NULL`; новые pages создают row уже с successful empty watermark в revision начального пустого Y.Doc, атомарно вместе с `PageDocument`. До активации page-scoped uploads на существующих страницах запускается ограниченный one-off rebuild command: читать `PageDocument` batch-ами, использовать `tiptapSchemaVersion` и persisted bytes, вызывать Document Projection #97, транзакционно блокировать строку document, сравнивать текущий revision и создавать watermark/пустой `PAGE_ASSETS`. Старый batch при конкурентном write пропускается и повторяется на актуальном состоянии.

На старте релиза `ASSETS_GC_ENABLED=false`; upload/grant для page разрешён только там, где projection marker уже равен текущему document revision. GC включается после первого rebuild pass и проверки отчёта. Ошибка/неподдерживаемая версия оставляет страницу stale, не создаёт частичный marker и не разрешает page grant; остальные pages/assets обслуживаются независимо. Avatar assets без page grants не требуют document rebuild.

Rebuild выводит `pageId`, current/target revision и typed error. Сразу после committed document write projection выполняется синхронно; если временная DB/connection/deadlock ошибка сорвала отдельную projection transaction, Nest `@nestjs/schedule` периодически выбирает ограниченный batch страниц, где watermark отсутствует или ниже текущей `storageRevision`, и повторно вызывает тот же #97 decoder/orchestrator с exact persisted bytes. Перед записью rows/marker всегда повторно проверяются revision guards.

`PageAssetProjection` хранит успешный `sourceStorageRevision` отдельно от `attemptedStorageRevision`, `attemptCount`, `retryAfter` и typed `lastErrorCode`. Ошибка projection не меняет references/watermark, но после rollback отдельная короткая transaction условно записывает retry metadata только для всё ещё текущей revision. Временные DB/serialization failures повторяются с capped exponential backoff и небольшим максимальным числом попыток на revision (рекомендуемо до 5); после исчерпания автоматические повторы останавливаются, stale остаётся видимым и требует следующего изменения документа или ручного rebuild. Повторный transient failure не запускает быстрые повторы в рамках scheduler tick. Permanent decoder/schema/invalid-media/eligibility errors отмечаются как permanent для текущей revision и автоматом не повторяются; новая `storageRevision` сбрасывает failure state. Ручной rebuild может явно повторить permanent revision после устранения причины. Это не требует queue/job framework; scheduler запускается существующим Nest schedule.

Rebuild и scheduler логируют `pageId`, current/target revision, error code, retry count и next retry time; после `ASSETS_PROJECTION_STALE_WARNING_SECONDS` выдаётся warning/alert. Автоматический GC не обходит stale barrier. Если конкретный asset связан grant-ом с постоянно stale page, он удерживается с явным сигналом оператору; stale страница не останавливает cleanup остальных assets.

### 11. Orphan cleanup, errors и recovery

Storage keys генерируются только сервером под managed prefix. Reconciliation перечисляет старые objects через paginated ListObjectsV2, но список — только кандидаты, не основание для удаления. Для каждого key успешная PostgreSQL transaction/lookup под row lock подтверждает, что он не является storageKey какого-либо ready/pending asset и что matching asset уже `deleted` либо отсутствует (старый rotated attempt); при DB timeout/error cleanup ничего не удаляет и повторяет сверку позже. Старый current pending key удерживается до TTL; grace больше максимального S3 upload request timeout, так что закончившийся in-flight Put не может завершиться после orphan sweep. GC сначала фиксирует tombstone и только потом вызывает DeleteObject. Для deleted asset физическое удаление идемпотентно; отсутствие object при повторе считается успехом.

Validation errors → 4xx и pending→failed; upload после ready → 409; missing/permission context не раскрывает наличие asset. Для DB unknown outcome объект не удаляется: API возвращает retryable error, сохраняет текущий key intent, а reconciliation получает достоверный результат после разрешения транзакции. Для ambiguous finalize commit lock/read ждёт текущую транзакцию: если ready committed — object сохраняется; если ready не committed — pending key остаётся доступен для безопасного retry/TTL cleanup. Failed/pending object удаляется только после committed tombstone. Никакой cleanup не трактует DB error как отсутствие key. Temp files очищаются в `finally`.

Новый queue/event bus не нужен: обычные uploads синхронны, periodic cleanup использует текущий Nest schedule. Structured logs содержат asset/page IDs, operation/revision/error category, но не signed URL, credentials или storage key.

### 12. Risks / Trade-offs

- [Temp disk нужен для bounded validation и повторно читаемого stream] → индивидуальный temp dir, max 10 MiB, process-local concurrent upload cap, backpressure, `finally rm`, `tmpdir` host monitoring; никакой неограниченной memory buffer.
- [S3 и PostgreSQL не имеют общей транзакции, а commit ack может потеряться] → committed key-intent до Put, unique non-reused keys, status conditional update, authoritative DB reconciliation, tombstone-before-delete; неизвестный исход всегда откладывает DeleteObject.
- [Live Hocuspocus уже синхронизировал Y.Doc до post-persistence projection] → invalid refs не отклоняют document persistence; projection остается stale, reference не получает PAGE_ASSETS/read authorization, а исправление/rebuild работает через существующий Y.Doc path. Возможен короткий период unresolved media.
- [Hocuspocus mutex и Redis store lock не охватывают все процессы и все write entrypoints одинаково] → все API writes используют expected-storageRevision CAS; stale conflict возвращает persisted Yjs state для merge в collaboration и ограниченного retry. При высокой конкуренции CAS exhaustion оставляет штатную persistence error, но не теряет уже committed updates.
- [Небольшая задержка записи документа во время page/asset row locks] → блокировать только grant pages, стабильный lock order, projection transaction повторно проверяет revision; тестировать конкурентные транзакции в PostgreSQL.
- [Старый/неподдерживаемый document schema мешает удалению asset с grant на page] → fail closed только для таких assets, не для всего GC; typed stale diagnostics, alert по возрасту, rebuild/restore recovery.
- [Local filesystem adapter не проверяет Selectel SigV4/endpoint quirks] → отдельный manual Selectel smoke обязателен до первого production deployment.
- [Backend upload занимает API bandwidth/temp disk] → ограничить body 10 MiB и process-local concurrent stream count; тяжёлые upload платформы не строить.

## Migration Plan

1. Additive Prisma migration добавляет asset/profile/page grant/projection структуры; `Asset.storageKey` задаётся при initiate, а только проверенные `mimeType`, `checksum`, `sizeBytes` nullable до ready. Существующие строки не требуют data backfill, поскольку assets пока отсутствуют.
2. Deploy API и production S3 configuration с GC выключенным; production bucket создаётся private в Selectel вне domain code, без закрепления storage pool.
3. Выполнить initial projection rebuild, исследовать ошибки; включить page upload/grants только после marker freshness на конкретной странице.
4. Включить GC после initial pass и ручной проверки rebuild отчёта. Остальные stale pages не блокируют GC, но их page grants/asset candidates защищены и подают alert.
5. До первого production deployment выполнить отдельный Selectel smoke с test bucket/изолированным prefix: Put, Head, presigned GET с реальным GET без credentials, Delete и Head 404; удалить test keys. Не включать workflow в required PR CI.
6. При будущем provider switch выполнить описанную maintenance procedure с uploads/physical delete paused, storageKey-preserving copy, checksum/size/count/key validation и rollback window; одновременно активные providers не поддерживаются.
7. Rollback приложения: отключить uploads/GC, оставить additive tables/tombstones. Не откатывать migration автоматически и не удалять objects; восстановить прежнее API после проверки данных.

## Open Questions

Архитектурных blocker-ов нет. До первого production deployment обязателен Selectel smoke test configured endpoint/credentials и безопасного upload/read/delete path. Exact TTL/cleanup interval defaults можно зафиксировать в реализации без изменения контрактов.
