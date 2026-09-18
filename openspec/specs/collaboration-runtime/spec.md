# collaboration-runtime Specification

## Purpose

Определяет самостоятельный realtime runtime Lite Notion: как authenticated WebSocket clients подключаются к Yjs-документам страниц, как проверяются Origin и права, как документ синхронизируется между клиентами и как binary Yjs state сохраняется в PostgreSQL.

## Requirements

### Requirement: Collaboration service is a standalone deployable runtime
Workspace MUST предоставить самостоятельное Node.js/TypeScript-приложение `apps/collaboration`, которое запускает Hocuspocus-compatible WebSocket service на собственном порту. Сервис MUST деплоиться отдельно от `apps/api` и MUST NOT требовать встраивания Hocuspocus в процесс NestJS API.

Сервис MUST валидировать runtime environment до приёма подключений. Обязательные настройки MUST включать node environment, port, базовый адрес API, сервисный креденшл для внутренних вызовов API и allowed frontend origin. Настройки прямого доступа к базе данных и подписывающий секрет MUST NOT входить в конфигурацию: сервис не подключается к базе и не проверяет подписи. Невалидная конфигурация MUST останавливать startup безопасной ошибкой без раскрытия secrets.

#### Scenario: Collaboration service starts with valid configuration
- **WHEN** collaboration runtime запускается с валидным environment
- **THEN** он слушает настроенный port и принимает WebSocket upgrade requests для authenticated document connections

#### Scenario: Invalid configuration stops startup
- **WHEN** обязательная настройка collaboration runtime отсутствует или невалидна
- **THEN** сервис завершается до приёма WebSocket connections
- **AND** ошибка не содержит значение сервисного креденшла

#### Scenario: Конфигурация не содержит доступа к базе и подписывающего секрета
- **WHEN** проверяется набор обязательных настроек collaboration runtime
- **THEN** он не содержит database URL, database connection timeout и JWT secret

#### Scenario: Collaboration remains separate from API
- **WHEN** API и collaboration запущены локально
- **THEN** остановка одного процесса не требует остановки другого процесса
- **AND** collaboration WebSocket connections обслуживаются collaboration runtime, а не API HTTP server

### Requirement: Collaboration validates WebSocket Origin
Collaboration runtime MUST принимать browser WebSocket connections только когда request `Origin` точно совпадает с `COLLABORATION_ALLOWED_ORIGIN`. Отсутствующий или несовпадающий Origin MUST отклоняться до document authorization, document load и document store. Allowed origin MUST приходить из runtime configuration и MUST NOT заменяться wildcard CORS behavior.

#### Scenario: Allowed Origin is accepted
- **WHEN** browser WebSocket client подключается с `Origin`, равным `COLLABORATION_ALLOWED_ORIGIN`
- **THEN** collaboration runtime продолжает authentication и document access checks

#### Scenario: Missing Origin is rejected
- **WHEN** browser WebSocket client подключается без Origin
- **THEN** collaboration runtime отклоняет connection до загрузки document state

#### Scenario: Mismatched Origin is rejected
- **WHEN** browser WebSocket client подключается с Origin, отличным от `COLLABORATION_ALLOWED_ORIGIN`
- **THEN** collaboration runtime отклоняет connection до загрузки document state

### Requirement: Collaboration authenticates WebSocket clients with API access tokens
Collaboration runtime MUST аутентифицировать clients тем же access JWT contract, который выдаёт API. Проверку токена runtime MUST делегировать API и MUST NOT выполнять её сам: он MUST NOT знать подписывающий секрет и MUST NOT содержать собственной реализации верификации.

Runtime MUST передавать предъявленный клиентом токен во внутренний вызов API без изменений и MUST получать в ответе идентификатор пользователя и идентификатор сессии. Отсутствующие, malformed, expired и invalid tokens MUST отклоняться по вердикту API.

Runtime MUST NOT иметь режима обращения к API от имени произвольного пользователя: личность MUST выводиться исключительно из предъявленного клиентом токена.

Результат authentication MUST быть доступен для document access decisions без логирования или раскрытия access token.

#### Scenario: Connection without token is rejected
- **WHEN** client подключается к collaboration document без access token
- **THEN** collaboration runtime отклоняет connection

#### Scenario: Invalid token is rejected
- **WHEN** client подключается с malformed, expired или incorrectly signed access token
- **THEN** collaboration runtime отклоняет connection

#### Scenario: Valid access token identifies user
- **WHEN** client подключается с valid API access token
- **THEN** collaboration runtime получает от API user id и session id для document access checks

#### Scenario: Проверка подписи выполняется только API
- **WHEN** collaboration runtime аутентифицирует подключение
- **THEN** проверку подписи и срока действия выполняет API
- **AND** collaboration runtime не располагает подписывающим секретом

### Requirement: Collaboration document names are page rooms
Collaboration runtime MUST принимать только document names в canonical format `page:<pageId>`, где `<pageId>` является UUID. Сервис MUST parse document name, извлекать `pageId` и отклонять unknown formats до загрузки или создания document state для такого имени.

Clients MUST NOT иметь возможность использовать arbitrary document names для обращения к storage rows или bypass page authorization.

#### Scenario: Valid page room is parsed
- **WHEN** client подключается к `page:550e8400-e29b-41d4-a716-446655440000`
- **THEN** collaboration runtime извлекает page id `550e8400-e29b-41d4-a716-446655440000`

#### Scenario: Malformed page room is rejected
- **WHEN** client подключается к `page:not-a-uuid`, `project:550e8400-e29b-41d4-a716-446655440000` или другому unsupported document name
- **THEN** collaboration runtime отклоняет connection до document load

### Requirement: Collaboration checks page access before document sync
До разрешения document connection collaboration runtime MUST проверить, что parsed page существует, не удалена, лежит в неудалённом проекте и доступна authenticated user по effective permission. Page, которая отсутствует, недоступна user, удалена или лежит в удалённом проекте, MUST отклоняться без раскрытия конкретной причины.

Отдельной проверки наличия `PageDocument` row при допуске MUST NOT требоваться: строка создаётся в одной транзакции со страницей, а её фактическое отсутствие всё равно останавливает комнату на загрузке документа. Комната без загруженного документа MUST NOT становиться работоспособной.

Effective permission MUST вычисляться той же моделью, которой пользуется REST API, и MUST NOT реализовываться в `apps/collaboration` повторно. Расхождение между решением API и решением collaboration runtime для одной пары «пользователь — страница» MUST NOT быть возможным. Runtime MUST получать роль вызовом внутреннего эндпоинта API и MUST NOT обращаться к базе данных напрямую.

Access decision MUST возвращать read/write capability boundary, вычисленный из роли: `viewer` MUST давать чтение без записи, `editor` и владелец страницы MUST давать чтение и запись. Runtime MUST map `canWrite` from that capability to Hocuspocus `connectionConfig.readOnly`.

Доступ MUST следовать границам наследования: пользователь, которому разрешение выдано на предка страницы, MUST допускаться к её комнате, а страница за границей `restricted` без собственного разрешения MUST отклоняться так же, как чужая.

#### Scenario: User can access own live page
- **WHEN** authenticated user подключается к `page:<pageId>` для своей non-deleted page
- **THEN** collaboration runtime разрешает document connection с write capability

#### Scenario: User without access is rejected
- **WHEN** authenticated user подключается к page другого owner, на которую ему ничего не выдано
- **THEN** collaboration runtime отклоняет connection без раскрытия существования page

#### Scenario: Deleted page is rejected
- **WHEN** authenticated user подключается к своей deleted page
- **THEN** collaboration runtime отклоняет connection и не пишет document state для этой page

#### Scenario: Страница удалённого проекта отклоняется
- **WHEN** authenticated user подключается к своей non-deleted page, проект которой помечен удалённым
- **THEN** collaboration runtime отклоняет connection тем же способом, что и удалённую page

#### Scenario: Читатель подключается только на чтение
- **GIVEN** пользователю выдан `viewer` на чужой странице
- **WHEN** он подключается к её комнате
- **THEN** collaboration runtime разрешает соединение и выставляет его read-only
- **AND** его Yjs updates не сохраняются в document state

#### Scenario: Редактор подключается с правом записи
- **GIVEN** пользователю выдан `editor` на чужой странице
- **WHEN** он подключается к её комнате
- **THEN** collaboration runtime разрешает соединение с write capability
- **AND** его изменения синхронизируются другим клиентам комнаты и сохраняются

#### Scenario: Доступ по унаследованному разрешению
- **GIVEN** пользователю выдан `editor` на чужой странице, а комната принадлежит её потомку в режиме `inherit`
- **WHEN** он подключается к комнате потомка
- **THEN** collaboration runtime разрешает соединение с write capability

#### Scenario: Граница restricted отклоняет соединение
- **GIVEN** пользователю выдан `editor` на чужой странице, а комната принадлежит её потомку в режиме `restricted` без собственного разрешения
- **WHEN** он подключается к комнате этого потомка
- **THEN** collaboration runtime отклоняет connection тем же способом, что и чужую page

#### Scenario: REST и collaboration решают одинаково
- **WHEN** для одной и той же пары «пользователь — страница» роль запрашивают REST API и collaboration runtime
- **THEN** оба получают одну и ту же роль, и право записи у них совпадает

#### Scenario: Решение о доступе принимается без обращения к базе
- **WHEN** collaboration runtime авторизует подключение
- **THEN** он получает роль ответом внутреннего вызова API
- **AND** процесс collaboration не открывает соединение с базой данных

### Requirement: Открытое соединение переавторизуется по сроку жизни токена

Collaboration runtime MUST принимать решение о доступе в момент подключения. Отзыв разрешения, понижение роли и переключение страницы в `restricted` MUST применяться к новым соединениям немедленно и MUST NOT требовать перезапуска сервиса.

Уже открытое соединение MUST переавторизовываться периодически, а не жить с однажды выданным решением до переподключения. Runtime MUST запрашивать у клиента действующий access-токен по сроку жизни ранее выданного и MUST повторять полную проверку доступа по полученному токену.

Верхняя граница устаревания решения MUST равняться сроку жизни access-токена: отзыв разрешения, понижение роли и переключение в `restricted` MUST применяться к уже открытому соединению не позже, чем через один такой срок. Истечение access-токена MUST прекращать соединение в тот же срок. Обе границы MUST сниматься одним механизмом, а не порознь.

Понижение роли до `viewer` MUST переводить уже открытое соединение в read-only без разрыва: пользователь, потерявший право записи, MUST сохранять возможность читать документ. Полная потеря доступа MUST закрывать соединение.

Клиент, не предоставивший действующий токен по запросу, MUST терять соединение по истечении ограниченного грейс-периода.

Отказ в доступе и невозможность его проверить MUST различаться. Недоступность API MUST NOT закрывать соединение немедленно: оно MUST сохраняться в пределах ограниченного грейс-окна, пока проверка невозможна по инфраструктурным причинам, и MUST закрываться по его исчерпании. Авторитетный отказ MUST закрывать соединение без применения грейс-окна.

#### Scenario: Отзыв применяется к новому соединению
- **GIVEN** владелец отозвал разрешение у пользователя с открытым соединением
- **WHEN** этот пользователь подключается к той же комнате заново
- **THEN** collaboration runtime отклоняет соединение

#### Scenario: Понижение роли применяется к новому соединению
- **GIVEN** владелец сменил роль пользователя с `editor` на `viewer`
- **WHEN** этот пользователь подключается к комнате заново
- **THEN** соединение открывается только на чтение

#### Scenario: Отзыв применяется к открытому соединению в пределах срока токена
- **GIVEN** у пользователя открыто соединение, а владелец отозвал его разрешение
- **WHEN** проходит срок жизни access-токена
- **THEN** collaboration runtime закрывает это соединение

#### Scenario: Понижение роли переводит открытое соединение в read-only
- **GIVEN** у пользователя с ролью `editor` открыто соединение, а владелец понизил его до `viewer`
- **WHEN** выполняется очередная переавторизация соединения
- **THEN** соединение продолжает работать, но его изменения перестают сохраняться
- **AND** соединение не разрывается

#### Scenario: Истёкший токен прекращает соединение
- **GIVEN** у пользователя открыто соединение
- **WHEN** срок действия его access-токена истёк и клиент не предоставил новый
- **THEN** collaboration runtime закрывает соединение

#### Scenario: Клиент продлевает соединение свежим токеном
- **GIVEN** у пользователя открыто соединение и доступ к странице сохранён
- **WHEN** runtime запрашивает действующий токен и клиент предоставляет свежий
- **THEN** соединение продолжает работать без переподключения и без повторной синхронизации документа

#### Scenario: Молчание клиента прекращает соединение
- **WHEN** runtime запросил у клиента действующий токен и не получил ответа в пределах грейс-периода
- **THEN** collaboration runtime закрывает соединение

#### Scenario: Недоступность API не разрывает соединение сразу
- **GIVEN** у пользователя открыто соединение
- **WHEN** очередная переавторизация не выполняется из-за недоступности API
- **THEN** соединение сохраняется в пределах грейс-окна
- **AND** по исчерпании грейс-окна соединение закрывается

#### Scenario: Отказ и недоступность различаются
- **WHEN** API отвечает авторитетным отказом в доступе
- **THEN** collaboration runtime закрывает соединение немедленно, не применяя грейс-окно

### Requirement: Collaboration synchronizes Yjs updates between clients
Для clients, authenticated и authorized в одной комнате `page:<pageId>`, collaboration runtime MUST синхронизировать Yjs updates так, чтобы каждый connected client видел changes других clients. Concurrent updates одного Yjs document MUST сходиться по Yjs semantics без потери acknowledged changes.

#### Scenario: Two clients sync the same page document
- **GIVEN** два authenticated clients имеют доступ к одной live page
- **WHEN** оба clients подключаются к `page:<pageId>`
- **AND** client A изменяет Yjs document
- **THEN** client B получает изменение

#### Scenario: Updates converge
- **GIVEN** два authenticated clients подключены к одной page room
- **WHEN** client A и client B выполняют concurrent Yjs updates
- **THEN** оба clients сходятся к одному document state

### Requirement: Collaboration persists binary Yjs state to PostgreSQL
Collaboration runtime MUST загружать current binary Yjs state при открытии page document и MUST сохранять updated binary Yjs state после document changes. Stored state MUST оставаться opaque Yjs binary state; TipTap JSON MUST NOT становиться source of truth.

Загрузка и сохранение MUST выполняться вызовами внутреннего документного эндпоинта API; collaboration runtime MUST NOT обращаться к `PageDocument` напрямую. Ответственность за транзакционность записи и за инварианты живости страницы MUST принадлежать API.

Загрузка и сохранение MUST предъявлять сервисный креденшл. Токен пользователя здесь не предъявляется: `onLoadDocument` срабатывает только для первого подключившегося к комнате, а у `onStoreDocument` пользователя в скоупе нет вовсе — проверка роли на этих операциях не покрыла бы остальных участников и создавала бы видимость защиты.

Пустой `yjsState` с `byteLength === 0` MUST инициализировать valid empty `Y.Doc` и MUST NOT передаваться в `Y.applyUpdate`. Каждый successful store MUST обновлять `PageDocument.yjsState`, инкрементировать `PageDocument.storageRevision` атомарно с записью state и обновлять timestamp строки. Store MUST NOT менять `tiptapSchemaVersion` только из-за Yjs update.

`onStoreDocument` MUST NOT авторизовывать пользователя через connection context, `lastContext` или последнего connected client: у сохранения нет пользователя в скоупе. Внутренний документный эндпоинт MUST аутентифицироваться сервисным креденшлом, а не токеном пользователя, и MUST повторно проверять только persistence invariants: page exists, document exists и `Page.deletedAt = null`.

Сохранение MUST выполняться как один transactional/conditional write на стороне API, который атомарно проверяет live page/document invariant и записывает `yjsState`, `storageRevision` и timestamp. Если conditional write затронул `0` rows, состояние MUST NOT сохраняться, и API MUST сообщить об этом collaboration runtime отличимым от прочих ошибок способом.

Если сохранение отклонено по инварианту живости для уже активной комнаты, runtime MUST закрыть все connections этой комнаты, завершить её active document state и MUST NOT обрабатывать этот случай как обычную retryable persistence error. После восстановления страницы новый connection MUST загрузить последнее успешно сохранённое состояние без изменений, сделанных после soft delete.

Перед отправкой runtime MUST отдельно проверить размер итогового `Y.encodeStateAsUpdate(document)` против `DOCUMENT_MAX_BYTES`. Этот предел MUST NOT использоваться как значение `websocketOptions.maxPayload`: размер одного WebSocket payload настраивается независимо через `WEBSOCKET_MAX_PAYLOAD_BYTES`.

#### Scenario: Existing document state is loaded
- **WHEN** client открывает page, whose document имеет non-empty stored `yjsState`
- **THEN** collaboration runtime инициализирует room из этого binary Yjs state

#### Scenario: Empty document state initializes empty Y.Doc
- **WHEN** client открывает page, whose document имеет `yjsState.byteLength === 0`
- **THEN** collaboration runtime инициализирует valid empty `Y.Doc`
- **AND** он не вызывает `Y.applyUpdate` с empty state

#### Scenario: Changed document is persisted
- **WHEN** authorized client изменяет page document
- **THEN** collaboration runtime отправляет resulting binary Yjs state во внутренний документный эндпоинт API под сервисным креденшлом
- **AND** последующее connection к той же page загружает stored content

#### Scenario: Store increments storage revision
- **WHEN** collaboration runtime успешно stores changed Yjs document
- **THEN** `storageRevision` инкрементируется атомарно с `yjsState` update
- **AND** `tiptapSchemaVersion` остаётся unchanged

#### Scenario: Сохранение выполняется без пользовательского токена
- **WHEN** collaboration runtime сохраняет документ после ухода последнего клиента комнаты
- **THEN** вызов документного эндпоинта аутентифицируется сервисным креденшлом
- **AND** сохранение выполняется успешно

#### Scenario: Store rejects deleted page invariant
- **WHEN** page удалена до сохранения document state collaboration runtime
- **THEN** conditional write затрагивает `0` rows
- **AND** store не записывает новый `yjsState`
- **AND** он не опирается на previous connection user context, чтобы обойти deleted-page invariant

#### Scenario: Active room is terminated after soft delete
- **GIVEN** authenticated client подключён к live page room
- **WHEN** page soft-deleted до следующего document store и client отправляет update
- **THEN** conditional write не меняет `yjsState` и `storageRevision`
- **AND** runtime закрывает connections этой комнаты и выгружает её document state
- **AND** после restore новый connection получает state до soft delete

#### Scenario: Document and WebSocket limits are independent
- **WHEN** client отправляет отдельный WebSocket payload в пределах `WEBSOCKET_MAX_PAYLOAD_BYTES`
- **AND** итоговый encoded Yjs state превышает `DOCUMENT_MAX_BYTES`
- **THEN** document state не записывается
- **AND** runtime не рассматривает WebSocket payload limit как размер всего Yjs document

### Requirement: Collaboration runtime shuts down cleanly
Collaboration runtime MUST обрабатывать завершение процесса: закрывать WebSocket/Hocuspocus server, flush pending document stores, если это поддерживает public Hocuspocus API, и освобождать подключение к общему брокеру до выхода процесса. Отключение от PostgreSQL MUST NOT входить в процедуру завершения: собственного подключения к базе у сервиса нет.

#### Scenario: Shutdown closes runtime resources
- **WHEN** collaboration runtime получает `SIGINT` или `SIGTERM`
- **THEN** он прекращает принимать новые WebSocket connections
- **AND** закрывает active server resources и подключение к брокеру до exit

### Requirement: Collaboration logging avoids sensitive data
Collaboration runtime MUST логировать server start, server stop, failed Origin validation, failed authentication, failed document access, document load/store errors и unexpected WebSocket errors с достаточным context для debugging. Logs MUST NOT включать access tokens, refresh tokens, full Yjs binary states или sensitive document/user content.

Runtime MUST применять bounded connection или payload limits через public Hocuspocus configuration с независимой настройкой `WEBSOCKET_MAX_PAYLOAD_BYTES`; итоговый encoded document size ограничивается отдельно через `DOCUMENT_MAX_BYTES`.

#### Scenario: Authentication failure is logged safely
- **WHEN** connection отклонена из-за authentication failure
- **THEN** collaboration runtime пишет safe log entry без token contents

#### Scenario: Origin failure is logged safely
- **WHEN** connection отклонена из-за Origin mismatch
- **THEN** collaboration runtime пишет safe log entry без access token или sensitive user data

#### Scenario: Oversized WebSocket payload is bounded
- **WHEN** client отправляет payload больше configured runtime limit
- **THEN** collaboration runtime отклоняет или закрывает connection без persistence partial document state

### Requirement: Реплики collaboration синхронизируются между собой

Collaboration runtime MUST допускать запуск в нескольких экземплярах за общим балансировщиком. Клиенты одной комнаты, попавшие на разные экземпляры, MUST видеть изменения друг друга и MUST сходиться к одному document state.

Синхронизация между экземплярами MUST выполняться через общий брокер. Экземпляр, получивший update по брокеру, MUST применять его к своему document state и MUST NOT инициировать из-за этого собственное сохранение: иначе один и тот же update персистится столько раз, сколько экземпляров его получило.

Awareness-состояние MUST синхронизироваться между экземплярами так же, как document updates: список участников комнаты MUST быть одинаковым у клиентов на разных экземплярах.

Недоступность брокера MUST останавливать startup так же, как любая другая невалидная обязательная зависимость, и MUST NOT приводить к молчаливой работе экземпляров в изоляции друг от друга.

#### Scenario: Клиенты на разных экземплярах видят изменения
- **GIVEN** запущены два экземпляра collaboration runtime
- **WHEN** два клиента одной комнаты подключены к разным экземплярам и один из них изменяет документ
- **THEN** второй клиент получает это изменение

#### Scenario: Участники комнаты одинаковы на разных экземплярах
- **GIVEN** два клиента одной комнаты подключены к разным экземплярам
- **WHEN** оба публикуют своё presence-состояние
- **THEN** каждый из них видит другого в списке участников

#### Scenario: Update по брокеру не порождает повторное сохранение
- **WHEN** экземпляр применяет document update, полученный по брокеру
- **THEN** он не инициирует собственное сохранение этого update

#### Scenario: Недоступный брокер останавливает startup
- **WHEN** collaboration runtime запускается при недоступном брокере
- **THEN** сервис завершается до приёма WebSocket connections
