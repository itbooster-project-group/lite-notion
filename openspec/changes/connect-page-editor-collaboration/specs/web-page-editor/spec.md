## ADDED Requirements

### Requirement: Collaborative session preserves the editor document contract

Collaborative page editing MUST использовать существующий `PAGE_CONTENT_YJS_FIELD`, versioned editor schema и текущие Tiptap/Yjs extensions. Editor MUST NOT создавать REST-loaded TipTap JSON или другую authoritative mutable content copy.

#### Scenario: Collaborative document uses the canonical field
- **WHEN** synced Y.Doc передаётся в editor
- **THEN** editor читает content из `PAGE_CONTENT_YJS_FIELD`
- **AND** persisted changes остаются binary Yjs updates

#### Scenario: Reconnect does not replace document state
- **WHEN** provider reconnects после временного disconnect
- **THEN** editor продолжает использовать исходный Y.Doc
- **AND** document state не сбрасывается в пустой или REST snapshot
