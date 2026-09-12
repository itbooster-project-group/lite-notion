## Purpose

Определяет presence-состояние пользователей в collaborative page document: Awareness, remote cursors и selection, список участников и очистку состояния при lifecycle changes без сохранения presence в документе или базе данных.

## ADDED Requirements

### Requirement: Presence uses the existing document collaboration session

Presence MUST передаваться через Awareness существующего Hocuspocus provider той же collaborative document session, которая владеет `Y.Doc`, transport и cleanup. Система MUST NOT создавать отдельный WebSocket, provider, REST API, Socket.IO channel или persisted presence storage. Awareness MUST NOT изменять и сохраняться как часть `Y.Doc`/PostgreSQL state.

#### Scenario: Presence shares the document provider
- **WHEN** пользователь открывает collaborative page document
- **THEN** его presence публикуется через Awareness существующего provider этой document session
- **AND** document synchronization continues through the same `Y.Doc` and transport

#### Scenario: Presence does not create persistence writes
- **WHEN** пользователь меняет cursor, selection или подключается к документу
- **THEN** presence не добавляет document content update и не создаёт запись в PostgreSQL

### Requirement: Current user presence has a stable identity and color

После подключения к document session `CollaborationCaret` MUST публиковать Awareness state с `user.id`, `user.name` и `user.color`; session не должна отдельно публиковать `Awareness state.user`. `id` и `name` MUST быть получены из authenticated session model, без ручного декодирования JWT. Цвет MUST определяться pure deterministic mapping `user.id -> hash -> predefined palette` и оставаться одинаковым для avatar, caret, selection, reconnect и rerender.

#### Scenario: Authenticated user announces presence
- **GIVEN** authenticated user имеет id `user-a` и name `Ada`
- **WHEN** его document session подключается к комнате
- **THEN** `CollaborationCaret` публикует Awareness state, содержащий `user: { id: "user-a", name: "Ada", color: <stable palette color> }`

#### Scenario: Same user receives the same color
- **WHEN** система вычисляет цвет для одного user id несколько раз, в том числе после reconnect
- **THEN** результат одинаков и используется во всех presence UI representations

#### Scenario: Session without current user is safe
- **WHEN** authenticated user data отсутствует или не содержит валидные id/name
- **THEN** система не публикует malformed user state и продолжает безопасно показывать collaboration UI без падения

### Requirement: Remote cursors and selections are rendered by the editor

Editor MUST использовать официальный TipTap CollaborationCaret с provider того же document collaboration session. Remote caret MUST показывать позицию, имя и цвет пользователя; remote selection MUST быть визуально различима и соответствовать тому же цвету. Собственный caret MUST NOT отображаться как remote cursor. Presence MUST работать независимо от `editable`: viewer остаётся read-only, но видит remote presence и сам присутствует в Awareness.

#### Scenario: Two users see each other's cursor
- **GIVEN** users A and B подключены к одному документу
- **WHEN** user A ставит курсор
- **THEN** user B видит remote caret A с именем A и стабильным цветом A

#### Scenario: Remote selection uses the user's color
- **WHEN** user A выделяет фрагмент текста
- **THEN** user B видит remote selection, окрашенный тем же цветом, что caret и participant A

#### Scenario: Viewer participates without editing
- **GIVEN** user B имеет роль viewer
- **WHEN** user B открывает документ
- **THEN** B появляется в Awareness и видит participants/cursors/selections
- **AND** B не может изменить document content

### Requirement: Participants UI represents active document users

Editor/workspace UI MUST показывать компактный список активных пользователей документа рядом с существующим collaboration status/header. Для пользователя MUST отображаться avatar или initials, deterministic color и доступное имя через tooltip/popover или эквивалентный доступный UI. Список MUST строиться из Awareness states и дедуплицироваться по `state.user.id`, а не по Yjs `clientID`. При длинном списке UI MUST показывать первые N участников и `+N` для остальных.

#### Scenario: Active users update without reload
- **WHEN** Awareness state другого пользователя добавляется или изменяется
- **THEN** participants UI обновляется без перезагрузки страницы и показывает его имя, initials/avatar и цвет

#### Scenario: Multiple tabs are one participant
- **GIVEN** один user id имеет несколько Awareness states с разными clientID
- **WHEN** participants UI строит список
- **THEN** пользователь показывается одной participant badge
- **AND** editor может отображать отдельные remote cursor states для разных clientID

#### Scenario: Malformed awareness is ignored
- **WHEN** Awareness содержит empty или malformed state без валидного `state.user.id`, `name` или `color`
- **THEN** state не ломает UI и не попадает в participants list

#### Scenario: Participants order and overflow are stable
- **WHEN** Awareness states приходят в разном порядке при одинаковом наборе пользователей
- **THEN** participants UI использует определённый стабильный порядок
- **AND** при превышении лимита показывает первые N пользователей и корректный `+N`

### Requirement: Presence follows connection and document lifecycle

При connect `CollaborationCaret` MUST публиковать local `Awareness state.user`, cursor и selection. При временном network disconnect provider/session MUST оставаться живыми; reconnect и восстановление local state MUST выполняться существующими transport/Awareness semantics. При disconnect/timeout Awareness semantics MUST удалять пользователя у остальных клиентов. При смене page, unmount editor, logout/session loss или explicit destroy MUST очищаться Awareness listeners, subscriptions, snapshots и provider-related resources. Старые participants MUST NOT оставаться после перехода на другую страницу.

#### Scenario: User disappears after temporary disconnect timeout
- **WHEN** временно отключившийся пользователь остаётся недоступен до истечения Awareness timeout
- **THEN** другие clients удаляют его из participants UI и remote cursor decorations

#### Scenario: Temporary disconnect keeps the session alive
- **WHEN** network connection пользователя временно прерывается
- **THEN** provider/session не уничтожаются
- **AND** существующий reconnect lifecycle может восстановить document и Awareness state

#### Scenario: Reconnect restores one participant
- **WHEN** пользователь disconnects и reconnects к тому же document
- **THEN** его presence появляется снова
- **AND** participants UI не создаёт duplicate badge для того же user id

#### Scenario: Explicit destroy cleans the previous session
- **WHEN** editor переходит с page A на page B или unmounts
- **THEN** owner явно уничтожает session A, которая снимает Awareness listeners/subscriptions, очищает snapshots и освобождает provider/Y.Doc resources
- **AND** participants page B не содержит пользователей только из page A

#### Scenario: Logout cleans local presence
- **WHEN** authenticated session теряется во время открытого документа
- **THEN** document session выполняет тот же cleanup lifecycle и не оставляет local presence state активным

### Requirement: Existing collaboration and permissions remain unchanged

Presence MUST NOT менять backend/Hocuspocus authorization, роль viewer/editor, `editable`, document source of truth или persisted Yjs behavior. Existing document synchronization MUST continue работать независимо от availability presence UI.

#### Scenario: Permission decisions remain authoritative
- **WHEN** viewer/editor permission проверяется для document connection или edit
- **THEN** используется существующая permission/capability logic, а Awareness не участвует в authorization

#### Scenario: Document collaboration survives presence failure
- **WHEN** malformed Awareness state или presence UI обработка завершается ошибкой
- **THEN** document synchronization and existing editor permission behavior remain available and safe
