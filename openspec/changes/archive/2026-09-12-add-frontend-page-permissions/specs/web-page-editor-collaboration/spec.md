## ADDED Requirements

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
