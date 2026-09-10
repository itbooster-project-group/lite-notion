## ADDED Requirements

### Requirement: Document write ownership transitions to collaboration without dual writers
System MUST считать `PageDocument.yjsState` canonical binary Yjs state для page content. Пока frontend всё ещё использует REST document writes, existing REST write path MUST оставаться доступным, чтобы introducing collaboration runtime не ломал current editing flows.

В этом change collaboration runtime MUST NOT получать ordinary editor traffic из `apps/web`, потому что frontend provider migration находится вне scope. После подключения frontend к Hocuspocus в будущем change collaboration runtime MUST стать единственным permanent writer `PageDocument.yjsState`. Future web provider migration MUST отключить или удалить REST autosave/write path в том же change, который включает WebSocket document writing, чтобы final architecture не держала одновременно browser REST writes и Hocuspocus persistence, пишущие один document state.

#### Scenario: Current REST document write remains during collaboration service introduction
- **WHEN** collaboration runtime существует, но frontend ещё не migrated to Hocuspocus provider
- **THEN** existing REST document write path остаётся доступным для current frontend
- **AND** ordinary editor traffic не использует collaboration runtime

#### Scenario: Future WebSocket migration avoids competing writers
- **WHEN** future change подключает frontend editor к Hocuspocus для document writes
- **THEN** REST autosave/write path, который конкурировал бы с collaboration persistence, отключается или удаляется в том же change
- **AND** у `PageDocument.yjsState` есть один permanent writer
