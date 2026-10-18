## Purpose

Ограничивает page attachment eligibility явными grants, удерживает assets живыми references и позволяет revision-safe projection/GC без глобальной блокировки документов.

## ADDED Requirements

### Requirement: Page-scoped grant разрешает только явно авторизованные media references

Перед созданием `PAGE_ASSETS` reference для пары `(pageId, assetId)` MUST существовать `PAGE_ASSET_GRANTS` row, а Asset MUST быть ready. Grant создаётся только при effective page edit permission и авторизации uploader-а asset; он не является retention reference. Upload в page context создаёт grant при initiate; повторное использование на другой странице требует отдельного grant от uploader-а, который также имеет edit permission целевой страницы. Текущие editors могут использовать уже granted asset только в контексте этой страницы. `PAGE_ASSETS` MUST иметь occurrence rows по `(pageId, assetId, nodeId)` и целостность к grant. Eligibility проверяется в post-persistence projection; ungranted/pending/failed/deleted refs MUST NOT создавать PAGE_ASSETS rows или получать read URL, но MUST NOT отклонять уже live-synced Y.Doc write.

#### Scenario: Upload создал page grant
- **WHEN** editor с effective edit permission инициирует page-context upload
- **THEN** pending asset и page grant создаются согласованно, а reference остаётся запрещённой до ready status

#### Scenario: Разрешённая asset reference
- **GIVEN** asset ready и page grant существует
- **WHEN** page editor сохраняет image node с этим assetId
- **THEN** document и PAGE_ASSETS projection могут быть сохранены

#### Scenario: Arbitrary чужой asset ID
- **WHEN** persisted document содержит ready asset без grant для страницы
- **THEN** projection остаётся stale без PAGE_ASSETS row, а page metadata/read URL для этого asset недоступны

#### Scenario: Pending/deleted asset reference
- **WHEN** persisted reference указывает на pending, failed или deleted asset
- **THEN** projection не создаёт PAGE_ASSETS row, marker остаётся stale, read URL не выдаётся

#### Scenario: Повторное использование asset
- **WHEN** uploader asset с page editor permission повторно выдаёт grant той же странице либо другой целевой странице
- **THEN** grant upsert идемпотентен, а использование разрешено только в страницах с grant

#### Scenario: Разные media nodes используют один asset
- **WHEN** два image node имеют разные UUID nodeId, но один assetId на странице с grant
- **THEN** PAGE_ASSETS сохраняет две occurrences, каждая один раз по PK `(pageId, assetId, nodeId)`

### Requirement: PAGE_ASSETS строится из exact successfully persisted Y.Doc

Система MUST использовать общий Document Projection boundary из #97 и captured `Y.Doc bytes`, `tiptapSchemaVersion`, `storage_revision`; Assets MUST NOT декодировать Yjs самостоятельно. Y.Doc persistence и projection используют один exact captured payload, но являются двумя последовательными commits: сначала document bytes/storage revision, затем PAGE_ASSETS occurrence set и `source_storage_revision` вместе в projection transaction. Projection MUST NOT читать произвольный live client state. Пустой документ MUST очищать PAGE_ASSETS и обновлять marker. Дубликат одного occurrence MUST схлопываться по PK; одинаковый asset в разных nodeId сохраняет каждую occurrence. Невалидная/неподдерживаемая схема либо неавторизованные refs MUST NOT приводить к частичной projection; прежние rows/marker остаются, а stale marker удерживает grant-scoped assets.

#### Scenario: Reference добавлена в сохранённый документ
- **WHEN** валидная schema v2 Y.Doc с разрешённым asset node успешно сохраняется как revision N
- **THEN** post-persistence projection для exact bytes N атомарно записывает PAGE_ASSETS occurrence и watermark N, если N остаётся текущей revision

#### Scenario: Reference удалена
- **WHEN** следующая revision не содержит прежний media node
- **THEN** transaction заменяет occurrence set и удаляет исчезнувшую PAGE_ASSETS row

#### Scenario: Пустой документ
- **WHEN** пустая revision успешно сохраняется
- **THEN** все PAGE_ASSETS rows страницы удаляются, а source revision marker обновляется

#### Scenario: Невалидная reference не создаёт доступ
- **WHEN** image node указывает на asset без grant или на deleted asset
- **THEN** Y.Doc persistence сохраняется, прежняя projection/marker остаётся целой и stale, document media signed reads для страницы fail closed, а invalid media недоступна через page context

#### Scenario: Ошибка projection transaction
- **WHEN** PAGE_ASSETS replacement или marker update завершается DB error после успешного document commit
- **THEN** projection transaction откатывается целиком, document остаётся committed, marker stale защищает grant-scoped assets и recovery повторяет projection

### Requirement: Revision safety и конкурентные writes сохраняют согласованность

Document write allocation сериализуется существующей `PAGE_DOCUMENTS` row lock. Projection/rebuild transaction берёт эту же строку, проверяет, что storage revision равен exact captured revision и не старше marker, затем берёт referenced Asset locks и атомарно меняет PAGE_ASSETS + marker. Document commit и projection commit разделены. Marker MUST быть монотонным. Все операции, затрагивающие page и assets, MUST брать page locks по стабильному UUID порядку, затем asset locks по стабильному UUID порядку.

#### Scenario: Старый rebuild приходит после новой revision
- **WHEN** rebuild для revision N завершается после сохранения N+1
- **THEN** row lock/revision check запрещает заменить PAGE_ASSETS или marker результатом N

#### Scenario: Конкурентные document writes и projection
- **WHEN** revisions N и N+1 сохраняются, а projection requests исполняются в обратном порядке
- **THEN** только exact текущая revision может обновить set/marker, N не перезаписывает N+1, а stale marker удерживает grant-scoped candidates до успешной projection

#### Scenario: Повтор той же revision
- **WHEN** один exact persisted capture обрабатывается повторно
- **THEN** его projection остаётся идентичной, без duplicate occurrence и без регресса watermark

#### Scenario: Перепроецирование пустого результата
- **WHEN** empty projection revision повторно обрабатывается
- **THEN** watermark остаётся на этой revision, хотя PAGE_ASSETS пуст

### Requirement: Initial rebuild и stale projection восстанавливаемы и наблюдаемы

После migration каждая существующая page MUST получить initial projection watermark через bounded rebuild из persisted bytes и общего #97 projection. Строка `PageAssetProjection` создаётся заранее с `sourceStorageRevision=NULL`; она также хранит revision последней попытки, ограниченный attempt count, `retryAfter` и typed error code. GC MUST оставаться выключенным до первого rebuild pass и проверки его отчёта. Page upload/grant MUST быть недоступен для page, чья projection marker отсутствует или не равна текущему storage revision. Rebuild MUST быть resumable/idempotent и revision-safe. Повреждённый или неподдерживаемый документ MUST сохранить прежние references/bytes и остаться stale без частичного watermark. Диагностика MUST показывать page, current revision и typed error, выдавать предупреждение при stale дольше настроенного порога, но stale page MUST NOT глобально блокировать GC других assets. Asset, разрешённый для stale page grant-ом, MUST оставаться защищённым до восстановления/исправления projection.

#### Scenario: Initial rebuild существующей страницы
- **WHEN** миграция создала PageAssetProjection row с NULL successful watermark и rebuild читает persisted page document
- **THEN** shared projection фиксирует watermark только если storage revision всё ещё совпадает с captured bytes

#### Scenario: Новая страница сразу готова к page asset upload
- **WHEN** page создаётся вместе с заведомо пустым Y.Doc и editor сразу инициирует page-context upload
- **THEN** та же транзакция создаёт успешный пустой `PageAssetProjection` watermark, равный фактической начальной `PageDocument.storageRevision`, и upload/grant не ждёт initial rebuild

#### Scenario: Upload для page до initial rebuild
- **WHEN** marker отсутствует или отстаёт от PageDocument.storageRevision
- **THEN** initiate/grant отклоняется с retryable состоянием до page-specific rebuild

#### Scenario: Rebuild конкурирует с document write
- **WHEN** page меняется после capture, но до rebuild commit
- **THEN** rebuild пропускает устаревший capture и не перезаписывает новые references

#### Scenario: Документ постоянно не поддерживается
- **WHEN** projection повторно завершается typed decoder/schema error
- **THEN** ошибка помечается permanent для этой revision и scheduler не повторяет её автоматически; страница остаётся явно stale, error/revision отражаются в logs/metrics/CLI report и связанные grant assets удерживаются; GC других страниц продолжает работу

#### Scenario: Recovery после исправления документа/schema
- **WHEN** документ восстановлен поддерживаемым content/schema и rebuild повторен
- **THEN** watermark достигает current storage revision, а GC снова проверяет ссылки обычным путём

### Requirement: GC сериализуется с page writes и attachment без глобального document lock

Для каждого asset GC MUST определить полный список страниц, где он может появиться, по PAGE_ASSET_GRANTS. Document persistence блокирует свою `PageDocument` для allocation revision; projection, grant creation и page cover update берут затронутые PageDocument rows по UUID, затем Asset rows по UUID. Страница MUST иметь PageDocument до создания grant. GC/delete MUST взять page locks только для grant pages кандидата, затем Asset lock, повторно прочитать grant set и начать transaction заново, если появился grant для незаблокированной страницы. Под locks GC MUST проверить projection marker на каждой grant page и все retention references, затем перевести asset в deleted. Новый grant после tombstone отклоняется; persisted media ref после гонки не получает PAGE_ASSETS/read authorization. Глобальная блокировка всех PAGE_DOCUMENTS запрещена.

#### Scenario: Projection/attach выигрывает гонку
- **WHEN** persisted page revision со ссылкой обновилась первой и её projection уже committed
- **THEN** GC после ожидания обнаруживает PAGE_ASSETS/retention reference и не логически удаляет asset

#### Scenario: GC выигрывает гонку
- **WHEN** GC блокирует page/asset раньше новой document revision и переводит asset в deleted
- **THEN** последующая projection не создаёт reference на deleted asset и signed read остаётся запрещённым; повторный grant отклоняется

#### Scenario: Параллельное создание новой страницы
- **WHEN** новая page создаётся одновременно с GC asset
- **THEN** page и пустой document/projection marker создаются атомарно; page не может сослаться на asset до получения grant, а grant после GC видит tombstone и отклоняется

#### Scenario: Во время GC добавляется grant на ранее неизвестную page
- **WHEN** uploader пытается выдать grant параллельно с GC, а эта page не была в initial grant set
- **THEN** единый lock order сериализует операции; GC обнаруживает committed grant при повторном чтении и повторяет проверку с полным page set, либо grant после tombstone отклоняется

#### Scenario: Stale projection не пропускает удаление
- **WHEN** document revision N committed, но projection для N ещё не обновила marker, пока GC проверяет asset
- **THEN** GC замечает marker старее текущего storage revision и откладывает удаление

### Requirement: Временная stale projection автоматически восстанавливается с ограниченным retry

Nest scheduler MUST периодически сканировать bounded batch missing/stale projection rows с наступившим `retryAfter` и повторно использовать API orchestration и Document Projection #97 на exact persisted bytes. Успешные `PAGE_ASSETS` rows и `sourceStorageRevision` меняются атомарно только при совпадении target/current document revision. Ошибка projection не меняет успешные rows/watermark; attempt diagnostics фиксируются отдельно и условно для всё ещё текущей revision. Только временные DB/connection/deadlock errors получают ограниченный exponential backoff и максимум 5 автоматических попыток на одну revision. Permanent decoder/schema/invalid-media/eligibility errors не повторяются scheduler-ом для той же revision; новая revision сбрасывает состояние, а operator может запустить ручной rebuild. После exhaustion stale остаётся наблюдаемым и требует изменения document или ручного recovery. Очередь и новый job framework не добавляются.

#### Scenario: Временная ошибка projection без нового document write
- **WHEN** документ revision N committed, projection transaction завершилась retryable DB/connection ошибкой, и новых document writes не было
- **THEN** Nest scheduler после `retryAfter` повторно вызывает общий #97 projection; при успехе marker становится N только если N всё ещё текущая revision

#### Scenario: Revision изменилась, пока ожидался retry
- **WHEN** scheduler выбирает retry для N, но до выполнения document становится N+1
- **THEN** retry для N ничего не перезаписывает, актуальная N+1 остаётся кандидатом projection, а attempt state N не сбрасывает/не задерживает её обработку

#### Scenario: Ошибка исчерпала bounded retries
- **WHEN** временная projection ошибка повторилась до configured maximum для той же revision
- **THEN** частые автоматические retries останавливаются, stale/retry exhaustion остаются видимы, а ручной rebuild или новая document revision может возобновить обработку

### Requirement: GC учитывает live references и удаляет объекты после tombstone

Asset MUST оставаться ready пока существует любая удерживающая reference: PAGE_ASSETS, PAGES.cover_asset_id, USER_PROFILES.avatar_asset_id и добавляемый #52 publication snapshot reference. Attachment grant сам по себе не удерживает object. Ready asset становится кандидатом только после explicit uploader delete request; автоматический expiry unreferenced ready assets в MVP не применяется, поскольку до asset library/list API #49 может удерживать upload для последующего attach. Delete request MUST конфликтовать, пока reference существует. Pending/failed assets подлежат cleanup после TTL. S3 errors MUST оставлять tombstone для retry; DB errors MUST предотвращать физическое удаление. При unknown DB outcome GC MUST отложить DeleteObject до успешной reconciliation. Deleted asset MUST NOT получать read URL. GC MUST быть идемпотентным.

#### Scenario: Live page media reference
- **WHEN** существует PAGE_ASSETS row для asset
- **THEN** GC не переводит его в deleted и не удаляет объект

#### Scenario: Cover/avatar reference
- **WHEN** asset установлен как page cover или профильный avatar
- **THEN** GC сохраняет asset до атомарного снятия ссылки

#### Scenario: Active publication держит snapshot image
- **WHEN** #52 добавляет SNAPSHOT_ASSETS/active publication cover reference, даже если live document его больше не содержит
- **THEN** retention check не удаляет asset до снятия текущей publication reference

#### Scenario: S3 delete error после tombstone
- **WHEN** PostgreSQL commit deleted успешен, но S3 delete завершается ошибкой
- **THEN** read URL не выдаётся, а следующий GC повторяет физическое удаление

#### Scenario: PostgreSQL tombstone не commit-ится или результат неизвестен
- **WHEN** DB transaction завершилась rollback, timeout или unknown outcome
- **THEN** GC не вызывает физический DeleteObject пока не получил подтверждённое состояние key/Asset из PostgreSQL

#### Scenario: Повторный GC
- **WHEN** GC повторно обрабатывает deleted asset или отсутствующий key
- **THEN** удаление завершается идемпотентно, а tombstone сохраняется

### Requirement: Orphaned attempt objects очищаются по managed prefix

S3 attempt keys MUST использовать серверный managed prefix и UUID; клиент не задаёт key. Cleanup MUST рассматривать объекты старше configured grace только как кандидаты, для каждого успешно сверять key с authoritative PostgreSQL state и удалять лишь неактивные attempt keys либо keys committed `deleted` asset. DB error/unknown outcome MUST откладывать удаление. Fresh upload attempt MUST NOT удаляться. Уже отсутствующий object считается успешно удалённым.

#### Scenario: Ambiguous DB commit после PutObject
- **WHEN** S3 подтвердил PutObject, PostgreSQL commit мог сохраниться, а API потерял commit response
- **THEN** reconciliation блокирует/повторно читает asset state; ready key сохраняется, unknown DB result откладывает удаление, а DeleteObject выполняется только после подтверждённого deleted/absent состояния

#### Scenario: Активная попытка upload или недоступная БД
- **WHEN** attempt object совпадает с committed pending/ready Asset.storageKey либо DB состояние недоступно
- **THEN** cleanup оставляет объект нетронутым и откладывает повторную проверку

### Requirement: Publication retention добавляется без перестройки lifecycle

Текущие retention sources MUST оставаться конкретными, но asset lifecycle MUST разрешать #52 добавить immutable snapshot references без изменения upload API, status transitions и storage adapter. #47 MUST NOT создавать publication tables, snapshot asset relations или public renderer. Public/snapshot read в будущих задачах MUST получить собственный проверенный context; bucket MUST оставаться private.

#### Scenario: #52 добавляет snapshot asset refs
- **WHEN** publication сохраняет immutable snapshot references на assets
- **THEN** GC учитывает их дополнительным retention source, независимо от live PAGE_ASSETS

#### Scenario: #53 читает опубликованное изображение
- **WHEN** public renderer запрашивает asset для валидной активной publication
- **THEN** будущий publication context выдаёт безопасный краткоживущий read URL без публичного bucket
