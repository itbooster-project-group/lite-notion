## Purpose

Даёт backend договор для атомарной публикации collaborative page как неизменяемой публичной версии, а также для её безопасного чтения и обслуживания frontend #53.

## ADDED Requirements

### Requirement: Публикация использует один актуальный capture документа

Backend MUST получать collaborative document через существующий capture boundary и MUST NOT строить publication из потенциально устаревшего persisted Yjs state в обход collaboration layer. Snapshot, rendering и asset references MUST быть получены из одного и того же успешно captured state. Возвращённый `source_storage_revision` MUST относиться именно к этим captured и persisted bytes. Ошибка capture или persistence MUST прерывать публикацию.

#### Scenario: Capture сохраняет актуальное состояние collaboration
- **WHEN** publish запрошен, пока Y.Doc содержит изменения новее последней обычной persistence
- **THEN** capture сохраняет точные bytes этого состояния и возвращает соответствующую им storage revision

#### Scenario: Capture недоступен или не сохранён
- **WHEN** collaboration capture, encoding или persistence завершается ошибкой
- **THEN** команда завершается ошибкой и ни одна публикация не переключается на новое состояние

#### Scenario: Live edit происходит после capture
- **WHEN** документ меняется после успешного capture, но до commit публикации
- **THEN** snapshot, rendering и refs соответствуют captured revision, а более поздний edit остаётся непубличным до следующего republish

### Requirement: Публикация создаёт immutable snapshot и rendering

Первая публикация и каждый republish MUST создавать новый immutable document snapshot с `reason = publication`, последовательной page revision, `source_storage_revision`, schema version и Yjs bytes capture. Из того же capture MUST создаваться один immutable rendering со `snapshot_id`, schema version, `content_json`, `generated_at` и зафиксированными публичным заголовком и cover metadata. Rendering MUST оставаться производным представлением, а public read MUST NOT декодировать Yjs на каждый запрос.

#### Scenario: Первый publish создаёт публичную версию
- **WHEN** авторизованный пользователь впервые публикует активную страницу с допустимым slug
- **THEN** backend сохраняет publication snapshot, rendering и publication, доступную после commit

#### Scenario: Republish создаёт новую версию
- **WHEN** опубликованная или ранее unpublished страница republish-ится
- **THEN** backend создаёт новый snapshot и rendering, не изменяет предыдущие snapshot/rendering и переключает publication только после готовности новой версии

#### Scenario: Live edit не меняет старую публикацию
- **WHEN** live Y.Doc меняется после успешной публикации без republish
- **THEN** public read возвращает прежний immutable rendering

#### Scenario: Schema version не поддерживается
- **WHEN** projection не поддерживает schema version или содержит неподдерживаемое/некорректное содержимое
- **THEN** publish завершается ошибкой без создания published состояния и без изменения предыдущей версии

### Requirement: Snapshot assets фиксируют публичную версию

Для каждой publication версии backend MUST сохранять content asset references, извлечённые из её captured state, отдельно от live page assets. Каждая ссылка MUST однозначно идентифицироваться snapshot, asset и node. До commit backend MUST проверить существование, `ready` status и допустимость каждого asset для этой страницы; cover MUST быть проверен отдельно и зафиксирован в rendering. Snapshot refs MUST быть неизменяемыми после создания. Ошибка projection или проверки asset MUST откатывать всю новую publication версию.

#### Scenario: Rendering и refs имеют общий captured state
- **WHEN** captured document содержит один или несколько media assets
- **THEN** snapshot bytes, `content_json` и snapshot asset refs описывают один и тот же Y.Doc capture

#### Scenario: Asset отсутствует, не готов или не разрешён странице
- **WHEN** projection ссылается на отсутствующий, pending, failed, deleted либо не granted для страницы asset
- **THEN** publish завершается ошибкой и не переключает publication

#### Scenario: Asset повторяется в разных nodes
- **WHEN** один asset используется в нескольких media nodes captured document
- **THEN** сохраняются отдельные node references без дубликатов одной и той же пары snapshot/asset/node

### Requirement: Publication persistence атомарна и конкурентные команды сериализованы

Snapshot, rendering, snapshot asset refs, publication pointer и revalidation event MUST фиксироваться одной DB транзакцией, открываемой соответствующим write use-case. `PublishPageUseCase` и `RepublishPageUseCase` сами MUST выполнять operation-specific permission checks, state transition decisions, transaction orchestration и mapping slug errors. Shared persistence helper MAY сохранять общие snapshot-derived rows только в переданный `TransactionScope`; он MUST NOT выбирать publish-сценарий, авторизовывать пользователя, проверять state transitions или открывать транзакцию. До успешного commit предыдущая публикация MUST оставаться публичной; при ошибке не должно оставаться новой опубликованной версии, publication без готового rendering или смешения snapshot и rendering. Write commands MUST повторно проверить эффективное право и активный lifecycle непосредственно в транзакции перед записью. Операции одной страницы MUST быть сериализованы существующим owner lock владельца страницы. Grant/revoke permissions MUST использовать тот же owner key, включая grant/revoke на ancestor, от которого наследуется роль. Новая lock abstraction допустима только после доказательства live-PostgreSQL тестом недостаточности текущего механизма.

#### Scenario: Ошибка после вставки snapshot откатывает pipeline
- **WHEN** вставка rendering, refs, publication или revalidation event завершается ошибкой
- **THEN** транзакция не оставляет частичную новую версию и прежняя публикация остаётся доступной

#### Scenario: Ошибка rendering откатывает публикацию
- **WHEN** rendering не удаётся построить или сохранить
- **THEN** новый snapshot не становится опубликованным и внешняя версия не меняется

#### Scenario: Два publish выполняются одновременно
- **WHEN** две publish команды для одной страницы конкурируют
- **THEN** результат соответствует последовательному выполнению, slug и snapshot revision не конфликтуют, а publication указывает на полностью готовую версию

#### Scenario: Publish и unpublish конкурируют
- **WHEN** publish/republish и unpublish выполняются одновременно для одной страницы
- **THEN** операции сериализуются без lost update и итог соответствует порядку commit

#### Scenario: Metadata update конкурирует с publish
- **WHEN** slug или SEO metadata обновляются одновременно с publish/republish
- **THEN** итоговая publication содержит целостные значения одной завершённой операции, а смена slug порождает invalidation старого и нового route

#### Scenario: Publish конкурирует с soft delete
- **WHEN** страница или проект удаляются во время подготовки публикации
- **THEN** транзакционная lifecycle-проверка не позволяет опубликовать удалённую страницу, а soft delete и publication не оставляют её публичной

#### Scenario: Revoke прямого editor permission конкурирует с publish
- **WHEN** владелец отзывает прямое editor permission одновременно с publish этого editor
- **THEN** обе операции используют owner lock страницы; если revoke сериализовался первым, publish повторно проверяет роль и завершается отказом, а если publish первым — revoke применяется после завершения publish

#### Scenario: Revoke унаследованного editor permission конкурирует с publish
- **WHEN** владелец отзывает editor permission на ancestor одновременно с publish дочерней страницы редактором
- **THEN** обе операции используют тот же owner lock дерева и результат соответствует порядку сериализации без публикации после уже завершённого revoke

### Requirement: Управление publication требует существующее эффективное право

Authenticated publication commands MUST использовать существующий effective permissions алгоритм и требовать `EDITOR` или `OWNER`. Утрата права до транзакционной записи MUST отменять команду. Операции над отсутствующей, soft-deleted страницей или страницей удалённого проекта MUST завершаться тем же not-found поведением, что и существующий page access boundary. Controller MUST передавать write command соответствующему use-case; бизнес-правила не должны находиться в controller.

#### Scenario: Editor публикует страницу
- **WHEN** пользователь имеет effective роль `EDITOR` или `OWNER` на активной странице
- **THEN** он может выполнить разрешённую управляющую команду

#### Scenario: Viewer или пользователь без доступа управляет публикацией
- **WHEN** effective роль пользователя ниже `EDITOR` либо отсутствует
- **THEN** команда отклоняется согласно существующей семантике доступа и publication не изменяется

#### Scenario: Permission отозван до записи
- **WHEN** право отозвано после предварительной проверки, но до транзакционной проверки команды
- **THEN** запись отклоняется и publication остаётся без изменений

### Requirement: Управляющий API валидирует команды и повторные операции

Backend MUST предоставлять authenticated API для чтения publication state, first publish, republish, unpublish и metadata/slug update. Publication state machine MUST допускать только переходы: no record → draft (metadata update с обязательным slug); no record/draft → published (first publish с обязательным slug); draft → draft (metadata update); draft → unpublished запрещён; published → published (republish с новым snapshot или metadata update без snapshot); published → unpublished (unpublish); unpublished → unpublished (metadata update или идемпотентный unpublish); unpublished → published (republish с новым snapshot). First publish для существующего unpublished row запрещён; используется republish. Slug MUST быть server-normalized, non-null, глобально уникален и безопасен. Slug обязателен при создании draft через metadata PATCH; в PATCH существующего row его можно опустить, но нельзя передать `null` или пустое значение. Metadata-only update MUST NOT создавать snapshot. PostgreSQL CHECK может проверять форму строки, но переходы являются application-level инвариантом. Slug collision/state conflict MUST возвращать стабильную conflict ошибку; validation ошибки MUST быть описаны в OpenAPI.

#### Scenario: Slug нормализуется и валидируется
- **WHEN** клиент передаёт допустимый slug с пробелами по краям или в верхнем регистре
- **THEN** backend сохраняет каноническую lowercase форму; пустая строка, разделители путей, точки, пробелы внутри, reserved web routes `api`, `login`, `register`, `profile`, `trash`, `projects` или превышение длины отклоняются

#### Scenario: Slug уже занят
- **WHEN** пользователь публикует или меняет slug на slug другой publication
- **THEN** API возвращает conflict, а текущие slug и published snapshot сохраняются

#### Scenario: Metadata обновляется без изменения документа
- **WHEN** пользователь обновляет SEO поля или slug без запроса republish
- **THEN** API меняет только publication metadata, не создаёт snapshot и инициирует revalidation после commit

#### Scenario: Metadata создаёт draft
- **WHEN** активная страница ещё не имеет publication row и клиент создаёт metadata через PATCH
- **THEN** slug обязателен и создаётся draft row с non-null unique slug

#### Scenario: Metadata создаёт draft без slug
- **WHEN** активная страница ещё не имеет publication row и PATCH не содержит slug или содержит null/пустое значение
- **THEN** API возвращает validation error и не создаёт publication row

#### Scenario: Запрещён переход draft в unpublished
- **WHEN** клиент вызывает unpublish для draft publication
- **THEN** API возвращает `409 publication_state_conflict` без изменения publication или создания revalidation event

#### Scenario: Unpublished publication republish-ится
- **WHEN** клиент вызывает republish для существующей unpublished publication
- **THEN** backend создаёт новый snapshot и переводит status в published

#### Scenario: Повторный unpublish
- **WHEN** пользователь повторяет unpublish для уже unpublished publication
- **THEN** запрос завершается успешно без создания snapshot или дополнительного события при отсутствии изменения состояния

#### Scenario: First publish не заменяет unpublished state
- **WHEN** клиент вызывает first-publish для существующей unpublished publication
- **THEN** API возвращает `409 publication_state_conflict` и сохраняет существующий slug/snapshot/status

#### Scenario: Другая unique constraint ошибка не маскируется под slug conflict
- **WHEN** запись publication нарушает unique constraint, отличный от `PagePublication.slug`
- **THEN** ошибка не преобразуется в `409 publication_slug_conflict`, а HTTP response не раскрывает Prisma или SQL details

#### Scenario: Удалённая страница получает управляющую команду
- **WHEN** publish, republish или metadata update выполняется для soft-deleted page/project
- **THEN** команда отклоняется как not found и не меняет publication

### Requirement: Public read возвращает только опубликованный immutable read model

Unauthenticated API MUST разрешать publication по slug только при `status = published`, активных page/project и наличии корректного snapshot с готовым rendering. Ответ MUST содержать только зафиксированный page title, SEO metadata, rendering schema version, immutable `content_json` и безопасные descriptors для разрешённых assets. Ответ MUST NOT содержать Yjs bytes, permissions, collaborators, presence, project metadata, user/uploader data, storage keys или приватные asset metadata. Public API MUST NOT обращаться к collaboration layer или декодировать Yjs на запросе.

#### Scenario: Public read возвращает публикацию
- **WHEN** существует активная опубликованная страница с готовым rendering
- **THEN** запрос по slug возвращает snapshot-bound title, SEO metadata, schema version, content JSON и только descriptors текущего snapshot/cover

#### Scenario: Публикация изменилась после live edit
- **WHEN** live документ был изменён, но republish не выполнялся
- **THEN** public read продолжает возвращать rendering текущего publication snapshot

#### Scenario: Rendering отсутствует или нарушен инвариант
- **WHEN** публикация указывает на snapshot без rendering либо с невалидной связью
- **THEN** public API отвечает safe not-found и не раскрывает детали состояния

#### Scenario: Недоступные slug имеют общую not-found семантику
- **WHEN** slug отсутствует, publication unpublished, page/project soft-deleted либо rendering невалиден
- **THEN** API возвращает одинаковый HTTP 404 contract без раскрытия причины

#### Scenario: Public response не раскрывает приватные данные
- **WHEN** анонимный клиент читает опубликованную страницу
- **THEN** response не содержит Yjs state, permissions, user data, storage key, uploader metadata или private project data

### Requirement: Management API читает состояние публикации

Authenticated `GET /api/v1/pages/:pageId/publication` MUST требовать effective `EDITOR+` и возвращать DTO `status`, non-null `slug`, `seoTitle`, `seoDescription`, `publishedAt` и `publicPath`. Для published state `publicPath` MUST быть ровно `/p/${slug}`; для draft/unpublished — `null`. API MUST NOT строить absolute frontend URL, использовать `CORS_ORIGIN` как web origin или доверять request Host. Активная страница без publication row MUST возвращать `404 publication_not_found`; отсутствующая, inaccessible или soft-deleted page/project MUST следовать существующей безопасной page not-found семантике. Read MUST NOT создавать draft side effect.

#### Scenario: Editor получает management DTO
- **WHEN** editor или owner читает publication активной страницы
- **THEN** API возвращает status, slug, nullable SEO metadata, publishedAt и `publicPath: "/p/<slug>"` только при status published

#### Scenario: Viewer читает management state
- **WHEN** пользователь имеет только VIEWER permission на страницу
- **THEN** API возвращает 403 согласно management permission policy

#### Scenario: Publication row отсутствует
- **WHEN** editor читает active page без publication row
- **THEN** API возвращает `404 publication_not_found` и не создаёт draft как побочный эффект read

#### Scenario: Management read запрошен для deleted page/project
- **WHEN** editor отправляет GET для soft-deleted page или page deleted project
- **THEN** API возвращает существующий page 404 и не раскрывает publication state

#### Scenario: Frontend получает canonical public path
- **WHEN** frontend #53 читает published management DTO
- **THEN** `publicPath` равен `/p/${slug}`, а frontend формирует абсолютную ссылку из собственного origin

### Requirement: Page title и cover фиксируются согласованно с публикацией

Rendering MUST фиксировать `pageTitle` и `coverAssetId` в publication transaction. Title MUST быть прочитан после блокировки Page row; cover id MUST быть сериализован с cover updates и eligibility MUST быть проверена в той же транзакции. Public read MUST использовать только immutable rendering fields, а не live `Page.title`/`Page.coverAssetId`.

#### Scenario: Title меняется одновременно с publish
- **WHEN** page rename конкурирует с публикацией
- **THEN** rendering фиксирует title из сериализованного порядка Page row update/lock и последующее переименование не меняет опубликованный title

#### Scenario: Cover меняется одновременно с publish
- **WHEN** cover update конкурирует с публикацией
- **THEN** публикация сериализует чтение cover с существующим `PageDocument → Asset → Page` write order и фиксирует либо полный предыдущий, либо полный новый cover

#### Scenario: Cover становится недоступным
- **WHEN** cover asset не существует, не ready, не granted странице или удалён до eligibility check
- **THEN** publish завершается ошибкой и не переключает publication

### Requirement: Public asset access проверяет текущую publication

Object storage MUST оставаться private. `content_json` MUST NOT сохранять permanent URL, resolver URL или signed URL. Public read MUST возвращать safe asset descriptors с `resolverPath` вида `/api/v1/public/publications/${slug}/assets/${assetId}` для refs из immutable content JSON. SSR #53 MUST разрешить этот path относительно настроенного `NEXT_PUBLIC_API_BASE_URL`, который MUST быть absolute `http(s)` API origin без path/query/fragment; итоговый URL использует API origin и path, а не frontend origin. SSR MUST NOT использовать request `Host`, `X-Forwarded-Host` или иной непроверенный origin. Это поддерживает разные frontend/API origins. Resolver MUST отвечать только `302 Found` с пустым body и `Location` на signed URL, если asset входит в current published snapshot либо cover current rendering, asset ready, а page/project active. Проверка current publication, membership, readiness и lifecycle является точкой авторизации запроса. Для отказа используется одинаковый safe 404 без `Location`. Одного `asset_id` MUST быть недостаточно. Resolver MUST выставлять `Cache-Control: private, no-store, max-age=0` и `Referrer-Policy: no-referrer`; signed URL MUST иметь TTL 60 секунд. Уже выданная signed URL может оставаться доступной до истечения TTL.

#### Scenario: Текущий snapshot image разрешён
- **WHEN** asset входит в `SnapshotAsset` текущего published snapshot и имеет ready status
- **THEN** public read возвращает `resolverPath`, а resolver отвечает 302 с signed URL и no-store headers

#### Scenario: SSR сопоставляет media reference с descriptor
- **WHEN** frontend #53 рендерит image node с `source.assetId` из content_json
- **THEN** SSR находит descriptor по assetId, строит absolute URL из configured API base и resolverPath и использует его как `img src`, не изменяя persisted rendering и не трактуя assetId как URL

#### Scenario: SSR не доверяет входящему Host
- **WHEN** public page запрошена с произвольным `Host` или `X-Forwarded-Host`
- **THEN** resolver URL строится только из configured `NEXT_PUBLIC_API_BASE_URL`, а не из request headers

#### Scenario: Resolver descriptor отсутствует
- **WHEN** image node не имеет descriptor в public response
- **THEN** SSR не строит URL из assetId и не обращается к private storage

#### Scenario: Приватный или чужой asset запрошен напрямую
- **WHEN** анонимный клиент запрашивает asset, который не входит в текущий snapshot/cover данной publication
- **THEN** resolver возвращает безопасный not-found и не подписывает object URL

#### Scenario: Asset относится только к предыдущей версии
- **WHEN** asset есть в историческом snapshot, но отсутствует в текущем published snapshot и cover
- **THEN** resolver не выдаёт его через текущую publication

#### Scenario: Publication снята или lifecycle удалён
- **WHEN** публикация unpublished, страница/проект удалены или asset удалён
- **THEN** resolver не выдаёт новую signed URL

#### Scenario: Ранее выданная signed URL после unpublish
- **WHEN** publication снята после выдачи короткоживущей signed URL
- **THEN** новые resolver запросы запрещены, а ранее выданная URL прекращает действовать после своего TTL

#### Scenario: Разрешённый resolver завершается одновременно с unpublish
- **WHEN** resolver успел проверить current publication, asset и lifecycle до commit unpublish, но завершает signing после commit
- **THEN** этот уже начатый запрос может вернуть 302 с URL, TTL которой отсчитывается при signing; проверка resolver-запроса, начатого после commit, возвращает safe 404, и транзакция или дополнительная блокировка вокруг object storage не используется

### Requirement: Soft delete прекращает публичный доступ без автоматического restore

Soft delete page/project MUST сделать текущую publication публично недоступной и инициировать invalidation affected routes после commit. Restore страницы или проекта MUST NOT автоматически возобновлять publication. Publish, republish и metadata update для удалённого lifecycle MUST быть запрещены. Исторические snapshots не удаляются этим поведением.

#### Scenario: Страница удалена
- **WHEN** активная опубликованная страница переносится в trash
- **THEN** publication становится недоступной в той же транзакции, а её публичный route попадает в revalidation event

#### Scenario: Проект удалён
- **WHEN** проект со страницами публикаций переносится в trash
- **THEN** все affected publications становятся недоступны атомарно с lifecycle change и routes включаются в invalidation

#### Scenario: Страница восстановлена
- **WHEN** soft-deleted page/project восстановлены
- **THEN** публикация остаётся unpublished до явного republish

### Requirement: Revalidation выполняется после commit и допускает retry

Каждая успешная операция publish, republish, unpublish, slug/SEO update и lifecycle unpublish MUST после commit инициировать invalidation frontend path `/p/${slug}`. При смене slug MUST инвалидироваться оба пути `/p/${oldSlug}` и `/p/${newSlug}`; soft delete invalidates все affected `/p/${slug}`. Ошибка внешней доставки MUST NOT откатывать committed publication. Повторная доставка MUST быть безопасной и MUST только инвалидировать routes без записи старого content в cache. Outbox delivery eventual-consistent: до доставки unpublish/soft delete stale HTML во внешнем cache может оставаться доступным. До готовности надёжной стратегии revoke frontend #53 MUST NOT сохранять public HTML в долгоживущем Next.js cache; backend public API MUST использовать no-store. Worker MUST claim через `FOR UPDATE SKIP LOCKED`, использовать PostgreSQL clock для создания и истечения 30-секундной lease и ограничивать каждую delivery attempt 10 секундами, включая HTTP timeout до 5 секунд и bounded ACK/failure transaction. Conditional ACK/failure MUST требовать совпадающий lease token и ещё не истёкший lease; позднее завершение не меняет outbox row даже если replacement claim ещё не состоялся.

#### Scenario: Revalidation после commit
- **WHEN** publication transaction успешно committed
- **THEN** revalidation event становится доступен delivery worker/scheduler только после commit

#### Scenario: Revalidation transaction откатывается
- **WHEN** publication transaction откатывается
- **THEN** revalidation event не доставляется и публичное состояние остаётся прежним

#### Scenario: Внешняя revalidation недоступна
- **WHEN** frontend endpoint возвращает ошибку или недоступен
- **THEN** committed публикация остаётся успешной, событие сохраняется для retry и ошибка наблюдаема в логах

#### Scenario: Slug изменён
- **WHEN** публикация меняет slug с `old` на `new`
- **THEN** один durable event содержит оба canonical frontend path `/p/old` и `/p/new`

#### Scenario: Повторная доставка приходит после более нового события
- **WHEN** старое invalidation событие повторяется после более нового publication update
- **THEN** доставка только инвалидирует routes и следующий read видит текущее DB состояние

#### Scenario: Frontend revalidation ещё не подключён
- **WHEN** backend работает без frontend revalidation endpoint
- **THEN** scheduler не claim-ит и не увеличивает attempts outbox rows, public API отвечает no-store, а frontend не использует long-lived public HTML cache

#### Scenario: Ограниченная доставка короче lease
- **WHEN** scheduler выполняет одну delivery attempt
- **THEN** полный claim-to-result deadline не превышает 10 секунд, HTTP timeout не превышает 5 секунд, config отвергает большее значение, а фиксированная 30-секундная lease превышает этот bound с запасом на claim/ack

#### Scenario: Несколько API instances claim-ят события
- **WHEN** scheduler instances одновременно выбирают pending outbox events
- **THEN** `FOR UPDATE SKIP LOCKED` не позволяет одновременно claim-ить одну запись до expiry lease; разные события могут обрабатываться параллельно

#### Scenario: API process завершается после claim
- **WHEN** worker завершается после claim до отправки или подтверждения event
- **THEN** истёкшая lease позволяет другому instance повторно claim-ить event; attempt ограничена deadline, а duplicate delivery остаётся безопасной

#### Scenario: Frontend принял event перед падением worker
- **WHEN** frontend обработал invalidation, но API process упал до записи deliveredAt
- **THEN** event доставляется повторно после lease expiry, idempotent invalidation не возвращает старое содержимое в cache, а поздний ACK первого worker отвергается по несовпадающему lease token

#### Scenario: Worker завершает attempt после lease expiry
- **WHEN** ACK или failure update приходит после `leaseUntil`, до или после того, как другой worker сделал reclaim
- **THEN** conditional update не меняет событие; late worker не может подтвердить или освободить истёкшую lease, а event остаётся доступным для повторного claim

#### Scenario: Unpublish ожидает отложенную revalidation
- **WHEN** unpublish или soft delete committed, но endpoint недоступен или не настроен
- **THEN** backend сразу отвечает safe 404 и запрещает новые asset URLs, event остаётся durable, а возможный stale Next HTML ограничен политикой #53 без long-lived cache и signed URL истекает по TTL
