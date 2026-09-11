## ADDED Requirements

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
