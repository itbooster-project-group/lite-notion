## ADDED Requirements

### Requirement: Frontend document writes use collaboration while REST PUT remains compatible

После frontend migration editor MUST отправлять document content changes через collaboration Yjs transport и MUST NOT читать document content через REST, выполнять REST autosave или вызывать `PUT /api/v1/pages/:pageId/document`. Existing authenticated REST PUT MUST remain available unchanged for temporary backward compatibility and legacy clients; this compatibility endpoint is not used by the migrated web editor and MUST NOT be used as a WebSocket error fallback.

#### Scenario: Web editor changes content
- **WHEN** user edits page content in the migrated web editor
- **THEN** change is applied to the current Y.Doc and sent through collaboration service
- **AND** web frontend не отправляет REST document PUT

#### Scenario: Legacy REST writer remains available
- **WHEN** legacy client вызывает authenticated `PUT /api/v1/pages/:pageId/document`
- **THEN** API сохраняет существующий REST behavior и validation contract
- **AND** introducing the frontend provider does not remove or change this endpoint

#### Scenario: WebSocket failure does not fall back to REST
- **GIVEN** collaboration provider находится в reconnecting или offline state
- **WHEN** editor сохраняет локальное Yjs изменение
- **THEN** web frontend не вызывает REST PUT как fallback
- **AND** изменение остаётся в lifecycle provider/session для reconnect policy

#### Scenario: Refresh reloads collaboration state
- **GIVEN** collaboration service persisted a document update
- **WHEN** browser refreshes and creates a new session for the same page
- **THEN** initial Yjs sync restores the persisted content without REST read или write
