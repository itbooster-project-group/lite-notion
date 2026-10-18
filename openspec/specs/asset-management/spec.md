## Purpose

Даёт web-клиенту приватный API для загрузки и использования изображений, сохраняя авторизацию на backend и объектную storage boundary отдельно от конкретного S3 провайдера.

## Requirements

### Requirement: Upload изображения проходит через bounded API stream

Авторизованный клиент MUST создавать pending upload с серверным `assetId` и explicit page/avatar context, а затем передавать bytes через NestJS API. API MUST ограничивать фактический объём 10 MiB независимо от `Content-Length`, принимать только JPEG, PNG и WebP, проверять фактическую сигнатуру/content type и вычислять SHA-256 checksum. При initiate API MUST committed-ить уникальный server-generated `storageKey` до любого S3 write; перед каждым content attempt (включая первый) pending key MUST быть атомарно заменён на новый уникальный key до PutObject. Клиент MUST NOT выбирать storage key или filesystem path. Asset MUST становиться `ready` только после успешной content validation, подтверждённой записи object storage и проверки сохранённого размера/metadata. К клиенту MUST NOT выдаваться signed upload URL.

#### Scenario: Успешная загрузка
- **WHEN** пользователь с правом upload создаёт pending asset, отправляет валидный image stream не больше 10 MiB, а S3 Put и Head подтверждают запись и metadata
- **THEN** asset становится ready, API возвращает его id и безопасную metadata, а storage key остаётся внутренним

#### Scenario: Файл превышает размерный лимит
- **WHEN** stream превышает 10 MiB, даже если `Content-Length` отсутствует или занижен
- **THEN** API прекращает чтение, не переводит asset в ready и очищает временный файл/object attempt

#### Scenario: Поддельный MIME или неподдерживаемое содержимое
- **WHEN** заявленный content type расходится с signature bytes либо тип не JPEG/PNG/WebP
- **THEN** загрузка завершается validation error, pending asset переходит в failed и объект не становится доступным для чтения

#### Scenario: Клиент пытается выбрать key или path
- **WHEN** клиент передаёт storage key, путь, filename с traversal segments либо чужой asset ID как место записи
- **THEN** API игнорирует/отклоняет значения и пишет только в серверный уникальный attempt key

#### Scenario: Ошибка локального temp stream
- **WHEN** temp file write, validation или cleanup завершаются ошибкой
- **THEN** API не переводит asset в ready и очищает созданный per-request temp directory настолько, насколько позволяет работающий процесс

### Requirement: Asset lifecycle повторяем и не перезаписывает ready object

Asset MUST проходить только `pending -> ready -> deleted`, `pending -> failed -> deleted`, `pending -> deleted` при TTL cleanup, либо `ready -> deleted`. Повтор stream upload разрешён только для pending asset и получает заранее committed новый непереиспользуемый server-generated attempt key. Ready asset и его key MUST быть неизменяемыми; повторный или конкурентный content upload MUST NOT перезаписывать ready object. Для конкурирующих pending attempts не более одной попытки MUST условно перевести asset в ready; проигравшие keys становятся reconciliation candidates, но не удаляются до положительной DB сверки. Validation failure переводит pending в failed; повторяемая S3/PostgreSQL ошибка оставляет pending до retry/TTL. `DELETE` MUST быть идемпотентен. Удалённый asset MUST NOT снова становиться ready и MUST NOT получать read URL.

#### Scenario: Retry pending upload
- **GIVEN** asset находится в pending после повторяемой storage error
- **WHEN** uploader отправляет новый валидный content stream
- **THEN** сервер создаёт новый attempt object и может условно перевести этот asset в ready

#### Scenario: Повтор upload после ready
- **GIVEN** asset уже ready
- **WHEN** клиент повторяет PUT content для этого asset
- **THEN** API отклоняет запрос без записи в storage и сохраняет прежние bytes/key

#### Scenario: Две конкурентные попытки
- **WHEN** два content upload одновременно работают с одним pending asset и разными attempt keys
- **THEN** только одна транзакция переводит asset в ready; проигравший key не меняет ready object и остаётся до reconciliation, которая удалит его только после подтверждённой DB сверки

#### Scenario: DB commit после object write имеет ambiguous outcome
- **WHEN** S3 подтвердил PutObject, PostgreSQL мог commit-ить pending→ready, но ответ commit потерялся/истёк timeout
- **THEN** API не вызывает DeleteObject, а повторная reconciliation блокирует/читает Asset: committed `ready` сохраняет object, подтверждённый `pending` позволяет retry, а failed state сначала проходит committed tombstone перед DeleteObject; DB unavailable/unknown откладывает cleanup

#### Scenario: Key intent commit имеет ambiguous outcome
- **WHEN** PostgreSQL мог сохранить новый pending/key-claim `storageKey`, но API не получил commit acknowledgement
- **THEN** API не запускает PutObject; последующая retry/reconciliation сначала подтверждает asset/key state

#### Scenario: Повторное удаление
- **WHEN** uploader повторно удаляет уже deleted asset
- **THEN** API возвращает идемпотентный результат и не восстанавливает asset

### Requirement: Object storage private и не привязано к бизнес-логике провайдера

Production MUST использовать private S3-compatible bucket через стандартный S3 API. Endpoint, region, bucket, access key, secret key и path-style MUST задаваться server env/config; credentials MUST оставаться на backend. Storage boundary MUST поддерживать stream upload, metadata/head, read/signed GET, delete и managed-prefix listing. Signed read URL MUST быть короткоживущим, ограниченным GET и выдаваться только после авторизации. Доменная логика MUST NOT зависеть от Selectel-specific SDK/API, storage pool или публичных object URLs.

#### Scenario: Конфигурация другого S3 endpoint
- **WHEN** endpoint/region/bucket/credentials/path-style меняются через конфигурацию без смены бизнес-правил
- **THEN** Assets module продолжает выполнять upload/head/read/delete через ту же S3 boundary

#### Scenario: В БД и Y.Doc нет provider-specific адресов
- **WHEN** asset сохраняется или его reference попадает в document projection
- **THEN** хранится только provider-independent storageKey и assetId, а endpoint/bucket/region/public URL не записываются

#### Scenario: Integrity checksum не зависит от ETag
- **WHEN** checksum проверяется при upload или ручном provider migration
- **THEN** сверяются сохранённый SHA-256 и фактические bytes, а ETag не предполагается MD5

#### Scenario: Selectel smoke перед production
- **WHEN** отдельный ручной/deployment smoke запускается с credentials и изолированным bucket/prefix
- **THEN** он выполняет PutObject, HeadObject, presigned GET и реальный HTTP GET bytes без AWS credentials на клиенте, DeleteObject и Head 404, очищая test keys; обязательный PR CI этих credentials не требует

#### Scenario: Bucket не публичен
- **WHEN** клиент не имеет signed read URL
- **THEN** прямой анонимный object read недоступен

#### Scenario: Storage error
- **WHEN** S3 Put/Head/Get/Delete завершается ошибкой или timeout
- **THEN** API не раскрывает key/credentials, применяет повторяемое lifecycle поведение и не выдаёт URL для неподтверждённого/deleted asset

### Requirement: Attachment eligibility и object access требуют раздельной авторизации

Система MUST отдельно проверять upload, attach, read и delete. Upload в page context MUST требовать существующее effective page edit permission и создавать page-scoped `PageAssetGrant`; avatar upload/change разрешён только текущему пользователю. Grant MUST создавать только uploader актива при effective edit permission на page. Повторное использование в той же странице разрешено её текущим editors; использование в другой странице требует нового grant от uploader-а и его effective edit permission на целевую page. Grant разрешает page attachment, но сам по себе MUST NOT предоставлять viewer read access или заменять page permission. Page media reference MUST указывать на ready asset с grant для этой page. Page cover assignment MUST требовать page edit permission и тот же grant. Metadata/read для page context MUST требовать effective page permission и grant; viewer дополнительно требует актуальной `PAGE_ASSETS` или cover reference. Для document media `PageAssetProjection.sourceStorageRevision` MUST совпадать с `PageDocument.storageRevision`, иначе signed read URL временно fail closed. Avatar read MUST требовать authenticated profile context и совпадения asset с текущим avatar user. Ownership, `assetId` и наличие reference сами по себе MUST NOT обходить эти правила. Delete MUST требовать uploader и отсутствие удерживающих references.

#### Scenario: Editor загружает и прикрепляет asset на доступной странице
- **WHEN** page editor начинает upload с page context, asset становится ready и image node с его assetId сохраняется в Y.Doc
- **THEN** созданный grant делает ссылку eligibility допустимой, а projection сохраняет её только после валидной persisted document write

#### Scenario: Чужой asset ID без page grant
- **WHEN** page editor вставляет UUID чужого ready asset без grant на эту page
- **THEN** Y.Doc persistence проходит по текущему Hocuspocus контракту, но post-persistence projection остаётся stale без PAGE_ASSETS и API не выдаёт metadata/read URL по этому page context

#### Scenario: Повторное использование на другой странице
- **WHEN** uploader asset имеет editor permission на целевую страницу и повторно выдаёт grant
- **THEN** grant upsert идемпотентен и asset разрешён для references только в этой странице

#### Scenario: Другой editor использует уже выданный grant
- **GIVEN** uploader ранее выдал asset grant странице
- **WHEN** другой текущий editor этой страницы добавляет asset image node
- **THEN** write разрешён по page permission и существующему grant

#### Scenario: Чтение по asset ID без контекста
- **WHEN** пользователь запрашивает metadata/read URL, передав только assetId либо контекст page без permission/reference
- **THEN** API не выдаёт private metadata или signed URL

#### Scenario: Viewer читает image в разрешённой странице
- **GIVEN** asset имеет grant и live PAGE_ASSETS/cover reference в странице
- **WHEN** пользователь имеет effective viewer permission и запрашивает read URL с этой page context
- **THEN** API выдаёт короткоживущий signed GET URL

#### Scenario: Avatar доступен аутентифицированному пользователю
- **WHEN** authenticated user запрашивает avatar другого user через его profile context
- **THEN** API подписывает только asset, совпадающий с текущим profile avatar

#### Scenario: Uploader не может обходить permission
- **WHEN** uploader asset не имеет page read/edit permission, но знает pageId или assetId
- **THEN** API отклоняет page-context read/attach независимо от ownership

### Requirement: API покрывает upload, media, cover и avatar use cases

API MUST предоставлять initiate upload, raw content upload, context-bound metadata/read, delete, grant для повторного использования, назначение/снятие page cover и собственного avatar. Page media attach/detach MUST происходить через обычный collaboration Y.Doc flow. Write operations MUST выполняться через use-cases; read operations MUST следовать существующему query/read pattern. Routes MUST использовать `/api/v1`, существующие DTO/validators, exception handling и OpenAPI conventions. Постоянные публичные URLs и storage keys MUST NOT возвращаться.

#### Scenario: API upload без S3 SDK на frontend
- **WHEN** web отправляет обычный HTTP body на API content endpoint
- **THEN** браузеру не нужны S3 credentials, Selectel SDK или знание endpoint/key

#### Scenario: Изменение cover и avatar
- **WHEN** editor устанавливает/снимает page cover либо пользователь устанавливает/снимает собственный avatar
- **THEN** соответствующий FK reference меняется транзакционно с проверкой ready status, permission и attachment eligibility

#### Scenario: Delete asset с активной reference
- **WHEN** uploader удаляет asset, который удерживает live PAGE_ASSETS, page cover, avatar или будущая публикация
- **THEN** операция возвращает conflict и не меняет status/object

### Requirement: Test storage adapters не доступны production конфигурации

Unit tests MUST иметь быстрый in-memory adapter с upload/read/delete/metadata и управляемыми ошибками. PostgreSQL integration tests MUST использовать filesystem adapter внутри уникального per-suite temporary directory, созданного Node.js API; cleanup MUST выполняться в `finally`/test teardown и параллельные suites MUST быть изолированы. Production MUST всегда использовать configured S3 adapter, а filesystem/in-memory adapters MUST подключаться только через test module wiring.

#### Scenario: Unit error injection без S3
- **WHEN** unit test моделирует Put, Head или Delete failure
- **THEN** in-memory adapter возвращает управляемую ошибку без сети и облачных credentials

#### Scenario: Параллельные filesystem suites
- **WHEN** integration suites параллельно создают и удаляют assets
- **THEN** каждая suite использует собственный temp directory и не удаляет чужие файлы

#### Scenario: Production adapter selection
- **WHEN** API запускается как production build/config
- **THEN** test filesystem adapter невозможно выбрать env-переменной
