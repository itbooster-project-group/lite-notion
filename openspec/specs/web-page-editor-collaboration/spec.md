# web-page-editor-collaboration Specification

## Purpose
Подключает интерактивный редактор страниц к realtime collaboration service через общий Yjs-документ, сохраняя текущую editor surface и безопасный auth/reconnect lifecycle.
## Requirements
### Requirement: Page editor uses the collaboration room for document content

Frontend MUST подключать страницу к canonical room `page:<pageId>` существующего collaboration service и MUST использовать один текущий `Y.Doc` как authoritative mutable content state. Domain/composition MUST формировать canonical room name, а generic shared transport MUST получать готовый `roomName`. URL collaboration service MUST поступать из `NEXT_PUBLIC_COLLABORATION_URL`; runtime code MUST NOT содержать localhost fallback.

#### Scenario: Page opens its collaboration room
- **WHEN** authenticated user открывает страницу с UUID `pageId`
- **THEN** frontend подключается к room `page:<pageId>` по configured collaboration URL
- **AND** TipTap/Yjs editor использует тот же `Y.Doc`, который обслуживает session

#### Scenario: Collaboration URL is not configured
- **WHEN** `NEXT_PUBLIC_COLLABORATION_URL` отсутствует или невалиден
- **THEN** session показывает безопасную ошибку подключения
- **AND** frontend не пытается подключиться к hardcoded localhost endpoint

### Requirement: Editor readiness follows initial Yjs synchronization

Editor MUST оставаться в loading state до завершения initial Yjs sync. После initial sync он MUST показывать существующий PageEditor с тем же Y.Doc; локальный или derived TipTap JSON MUST NOT становиться вторым source of truth.

#### Scenario: Initial sync completes
- **WHEN** collaboration provider завершает первый sync handshake
- **THEN** session становится ready
- **AND** editor становится доступен с содержимым synced Y.Doc

#### Scenario: Connection exists before sync completes
- **WHEN** WebSocket уже connected, но initial Yjs sync ещё не завершён
- **THEN** editor не считается ready и editable surface не показывается

### Requirement: Document and connection state have independent lifecycles

Session MUST expose connection states `connecting`, `connected`, `reconnecting` и `offline` отдельно от document readiness. Временный disconnect MUST сохранять Y.Doc, editor instance и unsent Yjs changes для последующего reconnect.

#### Scenario: Connection is lost after initial sync
- **GIVEN** editor уже ready и Y.Doc содержит content
- **WHEN** WebSocket disconnects временно
- **THEN** connection state становится `reconnecting` или `offline` согласно network state
- **AND** Y.Doc и editor не уничтожаются

#### Scenario: Connection is restored
- **WHEN** provider reconnects и повторно синхронизирует document
- **THEN** connection state становится `connected`
- **AND** существующий editor продолжает работать с тем же Y.Doc

### Requirement: Collaboration authentication follows the application session

Provider MUST отправлять актуальный access token через публичный auth callback. После authentication failure frontend MUST выполнить ограниченный refresh token flow и повторить подключение с новым access token; окончательный отказ MUST перевести session в безопасное offline/error state без бесконечного reconnect loop.

#### Scenario: Access token is refreshed before reconnect
- **GIVEN** текущий access token истёк во время disconnect
- **WHEN** provider начинает reconnect
- **THEN** token callback получает refreshed access token
- **AND** provider повторно аутентифицирует room этим token

#### Scenario: Authentication remains rejected
- **WHEN** collaboration service отклоняет token после допустимой refresh attempt
- **THEN** session не становится ready или остаётся без active connection
- **AND** пользователь получает безопасное состояние authentication failure без token details

### Requirement: Session cleanup releases all collaboration resources

`destroy()` MUST быть идемпотентным и MUST очищать Hocuspocus provider, WebSocket/listener subscriptions, browser network listeners и owned Y.Doc. Поздние provider callbacks MUST NOT менять destroyed session.

#### Scenario: Page route changes
- **WHEN** page composition уничтожает session при смене `pageId`
- **THEN** старый provider отключён и уничтожен
- **AND** старый Y.Doc уничтожен
- **AND** callbacks старой страницы не влияют на новую session

### Requirement: Collaboration editor composition preserves feature boundaries

Page composition MUST подключать collaboration session через публичные APIs page-editing, page-document и authentication. `shared/collaboration` MUST быть generic и MUST NOT знать page domain или правило `page:<pageId>`. `features/page-editing` MUST NOT импортировать внутренние auth modules, route composition или Hocuspocus implementation directly. Existing `PageEditor` и `PageEditorSurface` MUST remain reusable without transport-specific logic.

#### Scenario: Workspace renders a page editor
- **WHEN** valid page route и workspace metadata загружены
- **THEN** workspace монтирует existing PageEditor через collaborative session composition
- **AND** page tree/title metadata продолжают загружаться через REST

#### Scenario: Awareness UI is not part of this change
- **WHEN** collaboration editor подключается
- **THEN** система не показывает avatars, remote cursors или collaboration caret
- **AND** не добавляет отдельную awareness feature state

### Requirement: Collaboration lifecycle is safe under React StrictMode

React composition MUST создавать session/provider только внутри effect или hook lifecycle, а не во время render. Повторная последовательность mount → cleanup → mount MUST оставлять только актуальные provider, WebSocket listeners и owned Y.Doc; cleanup MUST быть идемпотентным.

#### Scenario: StrictMode remounts the page composition
- **WHEN** React выполняет mount → cleanup → mount для одной страницы
- **THEN** первый session/provider полностью уничтожен до завершения cleanup
- **AND** старый socket, listeners и Y.Doc не остаются активными
- **AND** второй editor использует только второй session/Y.Doc

### Requirement: Collaborative editor follows backend effective access role

Workspace MUST передавать `PageTreeNodeDto.accessRole` выбранной страницы в collaborative editor без вычисления inheritance или effective permissions на frontend. `viewer` MUST отображать editor с `editable=false`; `editor` и `owner` MUST отображать editor с `editable=true`.

#### Scenario: Viewer opens a shared page
- **WHEN** выбранная shared page имеет `accessRole=viewer`
- **THEN** collaborative session создаётся с `editable=false`
- **AND** editor показывает существующее read-only состояние

#### Scenario: Editor opens a shared page
- **WHEN** выбранная shared page имеет `accessRole=editor`
- **THEN** collaborative session создаётся с `editable=true`
- **AND** editor доступен для редактирования

#### Scenario: Owner opens an owned page
- **WHEN** выбранная owned page имеет `accessRole=owner`
- **THEN** collaborative session создаётся с `editable=true`
- **AND** существующее owned editing behavior сохраняется

### Requirement: Page or editable capability changes recreate the collaborative session

Page composition MUST учитывать `pageId` и вычисленную editable capability в lifecycle collaborative session. При изменении page или `editable` старый session MUST быть уничтожен, а новый MUST быть создан с актуальным значением. Изменение raw `accessRole`, не меняющее `editable` (например, `editor` → `owner`), не требует обязательного recreate; stale cleanup и callbacks MUST NOT затронуть новый session.

#### Scenario: User navigates between pages with different roles
- **WHEN** active page changes from page A to page B
- **THEN** session A уничтожается
- **AND** session B создаётся с editable mapping роли page B

#### Scenario: Editable capability changes for the same page
- **WHEN** active page сохраняет `pageId`, но backend role mapping меняет `editable`
- **THEN** текущая collaborative session уничтожается
- **AND** новая session получает новое значение `editable`

#### Scenario: Role changes without editable capability change
- **WHEN** active page сохраняет `pageId`, а `accessRole` меняется с `editor` на `owner`
- **AND** `editable` остаётся `true`
- **THEN** обязательное пересоздание collaborative session не требуется

### Requirement: Viewer does not receive owner-only permission operations

Role-based editor behavior MUST remain limited to document editability. Viewer и editor MUST NOT получать owner-only permissions API calls или controls управления grants/access mode в рамках shared page navigation и editor composition.

#### Scenario: Viewer opens a shared page
- **WHEN** page route context имеет `source=shared` и `accessRole=viewer`
- **THEN** frontend не вызывает owner-only permissions API
- **AND** editing controls скрыты через существующий editor contract

### Requirement: Viewer editor is read-only while collaboration remains available

Workspace MUST configure the collaborative editor from the page effective `accessRole`: `owner` and `editor` receive editable content, while `viewer` receives a read-only TipTap surface. Viewer MUST still create/load the collaborative document session, and frontend readonly MUST NOT replace backend/WebSocket authorization.

#### Scenario: Viewer opens a page
- **WHEN** a page has `accessRole=viewer`
- **THEN** the collaborative session loads normally with `editable=false`
- **AND** toolbar, bubble/slash menu, block actions and content mutation controls are absent or disabled

#### Scenario: Editor opens a page
- **WHEN** a page has `accessRole=editor`
- **THEN** content editing controls are available
- **AND** owner-only access controls are absent

#### Scenario: Access role changes
- **WHEN** the selected page or its editable capability changes
- **THEN** the editor applies the new readonly/editable state without creating a second permission algorithm
