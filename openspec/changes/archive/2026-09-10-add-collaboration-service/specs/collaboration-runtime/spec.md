## Purpose

Определяет самостоятельный realtime runtime Lite Notion: как authenticated WebSocket clients подключаются к Yjs-документам страниц, как проверяются Origin и права, как документ синхронизируется между клиентами и как binary Yjs state сохраняется в PostgreSQL.

## ADDED Requirements

### Requirement: Collaboration service is a standalone deployable runtime
Workspace MUST предоставить самостоятельное Node.js/TypeScript-приложение `apps/collaboration`, которое запускает Hocuspocus-compatible WebSocket service на собственном порту. Сервис MUST деплоиться отдельно от `apps/api` и MUST NOT требовать встраивания Hocuspocus в процесс NestJS API.

Сервис MUST валидировать runtime environment до приёма подключений. Обязательные настройки MUST включать node environment, port, database URL, database connection timeout, JWT secret и allowed frontend origin. Невалидная конфигурация MUST останавливать startup безопасной ошибкой без раскрытия secrets.

#### Scenario: Collaboration service starts with valid configuration
- **WHEN** collaboration runtime запускается с валидным environment
- **THEN** он слушает настроенный port и принимает WebSocket upgrade requests для authenticated document connections

#### Scenario: Invalid configuration stops startup
- **WHEN** обязательная настройка collaboration runtime отсутствует или невалидна
- **THEN** сервис завершается до приёма WebSocket connections
- **AND** ошибка не содержит значение JWT secret или database credentials

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
Collaboration runtime MUST аутентифицировать clients тем же access JWT contract, который выдаёт API. Token verification MUST проверять signature и expiration через configured JWT secret, извлекать authenticated user id и session id, а также отклонять отсутствующие, malformed, expired или invalid tokens.

JWT verification MUST использовать узкий shared primitive `packages/auth-token`, который содержит только access-token payload contract и verification. Он MUST NOT содержать Nest guards, Passport strategies, refresh/session logic, cookies, `AuthModule` или database access.

Результат authentication MUST быть доступен для document access decisions без логирования или раскрытия access token.

#### Scenario: Connection without token is rejected
- **WHEN** client подключается к collaboration document без access token
- **THEN** collaboration runtime отклоняет connection

#### Scenario: Invalid token is rejected
- **WHEN** client подключается с malformed, expired или incorrectly signed access token
- **THEN** collaboration runtime отклоняет connection

#### Scenario: Valid access token identifies user
- **WHEN** client подключается с valid API access token
- **THEN** collaboration runtime извлекает user id и session id для document access checks

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
До разрешения document connection collaboration runtime MUST проверить, что parsed page существует, принадлежит authenticated user в текущей access model, не удалена и имеет `PageDocument` row. Page, которая отсутствует, принадлежит другому user, удалена или не имеет document row, MUST отклоняться без раскрытия конкретной причины.

Access decision MUST возвращать internal read/write capability boundary, чтобы future permissions change мог различать viewer и editor access без изменения document-room format.
Runtime MUST map `canWrite` from that capability to Hocuspocus `connectionConfig.readOnly` and MUST NOT introduce a separate permissions architecture in this change.

#### Scenario: User can access own live page
- **WHEN** authenticated user подключается к `page:<pageId>` для своей non-deleted page
- **THEN** collaboration runtime разрешает document connection с write capability в текущей owner-only model

#### Scenario: User without access is rejected
- **WHEN** authenticated user подключается к page другого owner
- **THEN** collaboration runtime отклоняет connection без раскрытия существования page

#### Scenario: Deleted page is rejected
- **WHEN** authenticated user подключается к своей deleted page
- **THEN** collaboration runtime отклоняет connection и не пишет document state для этой page

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
Collaboration runtime MUST загружать current binary Yjs state из `PageDocument.yjsState` при открытии page document и MUST сохранять updated binary Yjs state обратно в `PageDocument.yjsState` после document changes. Stored state MUST оставаться opaque Yjs binary state; TipTap JSON MUST NOT становиться source of truth.

Пустой `yjsState` с `byteLength === 0` MUST инициализировать valid empty `Y.Doc` и MUST NOT передаваться в `Y.applyUpdate`. Каждый successful store MUST обновлять `PageDocument.yjsState`, инкрементировать `PageDocument.storageRevision` атомарно с записью state и обновлять timestamp строки. Store MUST NOT менять `tiptapSchemaVersion` только из-за Yjs update.

`onStoreDocument` MUST NOT авторизовывать пользователя через connection context, `lastContext` или последнего connected client. Store MUST повторно проверять только persistence invariants: page exists, document exists и `Page.deletedAt = null`.

Store MUST NOT выполнять отдельный check `Page.deletedAt = null` с последующим unconditional update. Сохранение MUST выполняться как один transactional/conditional write, который атомарно проверяет live page/document invariant и записывает `yjsState`, `storageRevision` и timestamp. Если conditional write затронул `0` rows, collaboration runtime MUST NOT сохранять state.

Если conditional write затронул `0` rows для уже активной комнаты, runtime MUST закрыть все connections этой комнаты, завершить её active document state и MUST NOT обрабатывать этот случай как обычную retryable persistence error. После восстановления страницы новый connection MUST загрузить последнее успешно сохранённое состояние без изменений, сделанных после soft delete.

Перед conditional write runtime MUST отдельно проверить размер итогового `Y.encodeStateAsUpdate(document)` против `DOCUMENT_MAX_BYTES`. Этот предел MUST NOT использоваться как значение `websocketOptions.maxPayload`: размер одного WebSocket payload настраивается независимо через `WEBSOCKET_MAX_PAYLOAD_BYTES`.

#### Scenario: Existing document state is loaded
- **WHEN** client открывает page, whose document имеет non-empty stored `yjsState`
- **THEN** collaboration runtime инициализирует room из этого binary Yjs state

#### Scenario: Empty document state initializes empty Y.Doc
- **WHEN** client открывает page, whose document имеет `yjsState.byteLength === 0`
- **THEN** collaboration runtime инициализирует valid empty `Y.Doc`
- **AND** он не вызывает `Y.applyUpdate` с empty state

#### Scenario: Changed document is persisted
- **WHEN** authorized client изменяет page document
- **THEN** collaboration runtime сохраняет resulting binary Yjs state в PostgreSQL
- **AND** последующее connection к той же page загружает stored content

#### Scenario: Store increments storage revision
- **WHEN** collaboration runtime успешно stores changed Yjs document
- **THEN** `storageRevision` инкрементируется атомарно с `yjsState` update
- **AND** `tiptapSchemaVersion` остаётся unchanged

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
- **THEN** document state не записывается в PostgreSQL
- **AND** runtime не рассматривает WebSocket payload limit как размер всего Yjs document

### Requirement: Collaboration runtime shuts down cleanly
Collaboration runtime MUST обрабатывать завершение процесса: закрывать WebSocket/Hocuspocus server, flush pending document stores, если это поддерживает public Hocuspocus API, и отключаться от PostgreSQL до выхода процесса.

#### Scenario: Shutdown closes runtime resources
- **WHEN** collaboration runtime получает `SIGINT` или `SIGTERM`
- **THEN** он прекращает принимать новые WebSocket connections
- **AND** закрывает active server resources и database connections до exit

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
