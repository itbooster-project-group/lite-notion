## 1. OpenSpec и dependency foundation

- [x] 1.1 Провалидировать proposal, delta specs и design; согласовать artifact status.
- [x] 1.2 Добавить `@hocuspocus/provider` в `apps/web`, обновить lockfile и сохранить существующую collaboration dev dependency.
- [x] 1.3 Добавить `NEXT_PUBLIC_COLLABORATION_URL` в web env/test/CI configuration.
- [x] 1.4 Добавить Playwright dependency/configuration и deterministic browser E2E command, не меняя обычный unit-test command.

## 2. Transport и PageDocumentSession

- [x] 2.1 Создать generic shared Hocuspocus transport adapter, принимающий готовый `roomName` и не содержащий page-specific naming.
- [x] 2.2 Расширить public PageDocumentSession contract subscription/connection snapshot-ами, сохранив in-memory session compatibility.
- [x] 2.3 На page-document/page-editing domain уровне формировать `page:<pageId>` и передавать его generic adapter-у.
- [x] 2.4 Реализовать CollaborativePageDocumentSession с одним Y.Doc, initial-sync readiness и connection state machine.
- [x] 2.5 Реализовать access-token callback, refresh/reconnect handling и safe authentication failure.
- [x] 2.6 Реализовать idempotent destroy provider/listeners/browser listeners/Y.Doc и stale-callback guards.
- [x] 2.7 Добавить unit tests room, lifecycle, cleanup, initial sync, reconnect, auth failure и offline transitions.

## 3. Web composition и editor integration

- [x] 3.1 Добавить публичный auth-session API для current token и forced refresh без раскрытия внутренних auth modules.
- [x] 3.2 Добавить page/workspace composition hook/component, который создаёт session по active page id и подписывает React state.
- [x] 3.3 Заменить page placeholder существующим PageEditor после session readiness; PageEditor/PageEditorSurface оставить transport-neutral.
- [x] 3.4 Добавить accessible connection status и тесты сохранения editor/Y.Doc при disconnect/reconnect.
- [x] 3.5 Обновить FSD boundary tests и проверить отсутствие Hocuspocus/auth deep imports в page-editing core.
- [x] 3.6 Проверить StrictMode-safe mount → cleanup → mount без orphan providers, sockets, listeners или Y.Doc.

## 4. REST compatibility и runtime configuration

- [x] 4.1 Удалить frontend document GET/PUT/autosave usage, сохранив backend PUT implementation и generated API contract; не добавлять REST fallback.
- [x] 4.2 Обновить CSP `connect-src` для API и configured collaboration WebSocket origins.
- [x] 4.3 Обновить LAN runner, чтобы передавать collaboration URL/allowed origin и управлять collaboration process.
- [x] 4.4 Обновить README и CI env только в пределах collaboration editor startup.

## 5. Integration tests

- [x] 5.1 Добавить two-context Hocuspocus protocol test с bidirectional Yjs synchronization и convergence как низкоуровневую проверку.
- [x] 5.2 Добавить обязательный Playwright E2E: два независимых browser contexts открывают одну страницу и проходят PageEditor → TipTap → Y.Doc → Hocuspocus → PageEditor.
- [x] 5.3 В Playwright E2E проверить изменения A→B и B→A без refresh, concurrent edits convergence и отсутствие frontend `PUT /api/v1/pages/:pageId/document`.
- [x] 5.4 В Playwright E2E проверить refresh/reopen и восстановление persisted Yjs content.
- [x] 5.5 Добавить reconnect test с сохранением local Y.Doc и provider lifecycle.
- [x] 5.6 Добавить tests на CSP, LAN configuration и отсутствие REST fallback.

## 6. Validation

- [x] 6.1 Запустить `openspec validate connect-page-editor-collaboration --strict`.
- [x] 6.2 Запустить web tests/typecheck/build и collaboration unit/integration tests.
- [x] 6.3 Запустить root lint, typecheck, test, build и проверить git diff на отсутствие generated output.
