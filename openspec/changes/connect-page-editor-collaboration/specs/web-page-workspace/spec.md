## ADDED Requirements

### Requirement: Page routes compose the collaborative editor

Workspace page route MUST создавать и уничтожать page document session вместе с active `pageId` и MUST передавать session в существующий PageEditor через page-level composition. Navigation, page title и page metadata MUST продолжать работать независимо от WebSocket connection state.

#### Scenario: Active page mounts its editor
- **WHEN** workspace resolves a live page route
- **THEN** page composition создаёт collaboration session для этого page id
- **AND** editor отображает loading state до initial Yjs sync

#### Scenario: Active page changes
- **WHEN** user navigates from page A to page B
- **THEN** session A destroyed
- **AND** session B подключается к room `page:<pageBId>` без утечки listeners или Y.Doc A

#### Scenario: Collaboration is unavailable
- **WHEN** metadata page loaded, но collaboration service недоступен
- **THEN** page title и workspace navigation остаются доступными
- **AND** editor показывает безопасное состояние ошибки/соединения
