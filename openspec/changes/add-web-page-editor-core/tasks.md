## 1. Review boundary и подготовка

- [x] 1.1 Получить human review обновлённых `proposal.md`, `design.md`, delta spec и задач до начала реализации editor core в PR #66.
- [x] 1.2 Реализовать editor core в том же PR #66, сохранив scope boundary: не добавлять REST adapter, Hocuspocus integration, backend/API changes или production persistence; временный in-memory workspace mount разрешён только для ручного QA.
- [x] 1.3 Перед разрешённой реализацией сверить актуальный `main`, `docs/database-schema.md` и nested `AGENTS.md`; уточнить пути FSD без изменения ownership, заданного design.

## 2. Dependencies и FSD ownership

- [x] 2.1 Добавить только реально импортируемые TipTap 3/Yjs/Lucide dependencies в `@lite-notion/web`, сохранить принятый `lucide-react` и обновить lockfile через pnpm; не добавлять Hocuspocus packages.
- [x] 2.2 Создать `entities/page-document` для schema version, collaboration field, schema factory, Yjs conversion и media/link validation; убедиться, что entity не импортирует feature, widget, transport или React UI.
- [x] 2.3 Создать `features/page-editing` для minimal `PageDocumentSession`, `InMemoryPageDocumentSession` и TipTap interaction UI; оставить `widgets/page-editor` композиционным слоем status/surface без persisted schema и transport lifecycle.
- [x] 2.4 Добавить import-boundary/architecture tests, подтверждающие ownership entity/feature/widget, отсутствие document API/Hocuspocus import из editor core и отсутствие editor mount в финальном workspace после ручного QA.

## 3. Persisted schema v1 и static-renderability

- [x] 3.1 Реализовать и экспортировать `PAGE_DOCUMENT_SCHEMA_VERSION = 1` и `PAGE_CONTENT_YJS_FIELD = 'default'`; хранить/валидировать schema version отдельно от binary Yjs state через `PAGE_DOCUMENTS.tiptap_schema_version` и передавать field явно в TipTap Collaboration и Yjs conversion utilities.
- [x] 3.2 Добавить Yjs round-trip tests для populated и empty document: `empty Y.Doc → getXmlFragment(field) → encodeStateAsUpdate → applyUpdate(new Y.Doc) → getXmlFragment(field)` даёт valid empty editor document; interactive editor и conversion/static preparation читают тот же canonical fragment без проверки его физического наличия в update.
- [x] 3.3 Реализовать единую schema factory для базовых nodes/marks, custom media nodes и link mark; отключить стандартный TipTap history при Collaboration/Yjs.
- [x] 3.4 Зафиксировать attrs/defaults/validation `image`: generated stable `nodeId`, HTTPS `src` без credentials, `alt`, `decorative`, optional `caption`, `alignment` и integer `widthPercent` 25–100; покрыть invalid combinations и boundary values tests.
- [x] 3.5 Зафиксировать attrs/defaults/validation `youtube`: generated stable `nodeId`, normalized allowlisted video ID вместо URL/iframe HTML, optional caption/alignment/widthPercent; покрыть normalisation supported URLs и invalid hosts/IDs tests.
- [x] 3.6 Зафиксировать attrs/defaults/validation `video`: generated stable `nodeId`, HTTPS MP4/WebM source без credentials, optional caption/alignment/widthPercent; покрыть invalid protocol/format tests.
- [x] 3.7 Реализовать node ID lifecycle: генерация при insertion, сохранение при edit/resize/move, deconflict на clone/paste/import и доступность для derived JSON/static mappings; покрыть unit tests.
- [x] 3.8 Реализовать link normalization для HTTPS/HTTP/mailto и безопасный rendering external links с `rel='noopener noreferrer'`; покрыть запрещённые schemes tests.
- [x] 3.9 Реализовать deterministic non-editor HTML/static mappings для каждого custom node/mark без React NodeView: `figure`/caption/image/video, privacy-enhanced YouTube iframe и link output.
- [x] 3.10 Добавить fixture tests `Y.Doc → TipTap JSON → static mappings` для schema v1, field, node IDs, widthPercent и deterministic output без монтирования interactive editor; не создавать public route или publication snapshot writer.
- [x] 3.11 Добавить admission tests для supported/unsupported `PAGE_DOCUMENTS.tiptap_schema_version`, incompatible metadata и corrupted Yjs state: только поддерживаемая metadata с декодируемым state даёт ready и surface; отсутствие materialized field в empty update не является error. Зафиксировать version bump/compatibility migration для добавления, удаления или переименования persisted node/mark, attrs/defaults/semantics и `PAGE_CONTENT_YJS_FIELD`.

## 4. Minimal document session и lifecycle cleanup

- [x] 4.1 Определить transport-neutral `PageDocumentSession` только с `doc`, `editable`, status `loading|ready|error`, typed error и `destroy()`; `ready` означает validated schema metadata плюс successfully decoded Yjs state. Не добавлять в общий type dirty/save/retry/flush или Hocuspocus connection/sync states.
- [x] 4.2 Реализовать `InMemoryPageDocumentSession` и fake test helper для unit tests, Storybook и isolated development без document API/WebSocket/persistence lifecycle; factory принимает schema metadata и не монтирует surface для unsupported version.
- [x] 4.3 Реализовать `PageEditor`/`PageEditorSurface` boundary: surface получает только admitted ready Y.Doc и editable presentation props и не знает transport, persistence, connection diagnostics или database schema-version validation.
- [x] 4.4 Реализовать идемпотентный cleanup при page identity change, unmount и replacement session: Y.Doc/editor listeners, local UI timers/pending callbacks, TipTap editor и временный Y.Doc.
- [x] 4.5 Добавить tests, подтверждающие, что callbacks уничтоженной session не меняют replacement session и не создают stale editor/listener/timer effects.
- [x] 4.6 Добавить architecture contract test будущей replaceability: fake transport предоставляет тот же minimal ready-doc boundary без изменения schema или `PageEditorSurface`; не реализовывать Hocuspocus adapter.

## 5. TipTap surface, media security и доступные interactions

- [x] 5.1 Реализовать базовые formatting, Yjs-compatible local undo/redo и presentation-only read-only state; отсутствие client-side controls не объявлять authorization boundary.
- [x] 5.2 Реализовать BubbleMenu, slash menu и link form с keyboard flows, безопасными errors и корректным focus return.
- [x] 5.3 Реализовать URL-only image/YouTube/video insertion и deterministic fallback; не добавлять file upload, base64 media или arbitrary iframe content.
- [x] 5.4 Применить renderer-compatible media security attrs: privacy-enhanced YouTube origin, fixed iframe attrs, image/iframe referrer policy, native video controls/preload и CSP target `img-src`, `media-src`, `frame-src`, `object-src` из design.
- [x] 5.5 Реализовать top-level pointer drag handle и keyboard-reachable `Move up`/`Move down` через общий transaction path; исключить самостоятельные handles у вложенных list items.
- [x] 5.6 Добавить RTL/accessibility tests для keyboard slash menu, link/media errors, focus return, status live regions, read-only controls, keyboard move actions, disabled boundaries и pointer reorder parity.

## 6. Dependency, security и completion verification

- [x] 6.1 Проверить pnpm dependency graph на единственную согласованную версию `yjs` и отсутствие конфликтующих версий/экземпляров `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` и используемых TipTap extensions.
- [x] 6.2 Добавить CI/checklist verification dependency consistency и runtime identity smoke test там, где duplicate ProseMirror/Yjs instance нарушает collaboration contract.
- [x] 6.3 Проверить media URL validator, generated static mappings и target CSP/referrer policy against security fixtures; расширение host/protocol allowlist требует отдельного review.
- [x] 6.4 После разрешённой реализации запустить детерминированные unit/RTL tests несколько раз, включая Yjs field round-trip, static-renderability fixtures, node ID lifecycle, cleanup и accessibility flows.
- [x] 6.5 Запустить `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Steiger и relevant web checks.
- [x] 6.6 Временно заменить workspace placeholder на `PageEditor` с отдельной `InMemoryPageDocumentSession` на `pageId`, показать warning о сбросе content при reload/navigation и проверить mount вручную и тестом без API/persistence; после QA удалить mount, восстановить placeholder и зафиксировать отсутствие editor surface в workspace test.
- [ ] 6.7 Запустить `openspec validate add-web-page-editor-core --strict`, получить human review implementation и архивировать change только после выполнения текущих tasks, CI и review.

## Follow-up work — не является задачами этого change

- Отдельный Hocuspocus change реализует provider/server, connection/sync diagnostics, effective permissions и production composition. До начала полноценной editing/collaboration session adapter валидирует `PAGE_DOCUMENTS.tiptap_schema_version`; Yjs protocol validity не заменяет TipTap/ProseMirror application-schema compatibility. `synced` с collaboration server не будет интерпретироваться frontend как PostgreSQL durability guarantee.
- Отдельный publication change создаст immutable derived TipTap JSON при publish и public Next.js renderer без per-request Yjs decode.
- Отдельный asset change свяжет уже сохранённые media `nodeId` с `PAGE_ASSETS` и определит uploads/asset lifecycle.
- Если снова понадобится REST editor, отдельный reviewed change определит REST-specific save lifecycle и single-writer protection; он не расширяет base `PageDocumentSession`.
