## 1. Review boundary и подготовка

- [ ] 1.1 Получить human review обновлённых `proposal.md`, `design.md`, delta spec и задач до начала реализации; не начинать implementation по PR #66 без отдельного подтверждения.
- [ ] 1.2 Сохранить PR #66 planning-only: проверить, что diff не содержит application code, dependency manifests, lockfile, API changes, Hocuspocus integration или workspace production wiring.
- [ ] 1.3 Перед разрешённой реализацией сверить актуальный `main`, `docs/database-schema.md` и nested `AGENTS.md`; уточнить пути FSD без изменения ownership, заданного design.

## 2. Dependencies и FSD ownership

- [ ] 2.1 Добавить только реально импортируемые TipTap 3/Yjs/Lucide dependencies в `@lite-notion/web`, сохранить принятый `lucide-react` и обновить lockfile через pnpm; не добавлять Hocuspocus packages.
- [ ] 2.2 Создать `entities/page-document` для schema version, collaboration field, schema factory, Yjs conversion и media/link validation; убедиться, что entity не импортирует feature, widget, transport или React UI.
- [ ] 2.3 Создать `features/page-editing` для minimal `PageDocumentSession`, `InMemoryPageDocumentSession` и TipTap interaction UI; оставить `widgets/page-editor` композиционным слоем status/surface без persisted schema и transport lifecycle.
- [ ] 2.4 Добавить import-boundary/architecture tests, подтверждающие ownership entity/feature/widget и отсутствие document API/Hocuspocus import из editor core и production workspace/route entry points.

## 3. Persisted schema v1 и static-renderability

- [ ] 3.1 Реализовать и экспортировать `PAGE_DOCUMENT_SCHEMA_VERSION = 1` и `PAGE_CONTENT_YJS_FIELD = 'default'`; передать field явно в TipTap Collaboration и во все Yjs conversion utilities.
- [ ] 3.2 Добавить Yjs round-trip test, который записывает content в `PAGE_CONTENT_YJS_FIELD` и подтверждает, что interactive editor и conversion/static preparation читают именно этот fragment, а не неявный default.
- [ ] 3.3 Реализовать единую schema factory для базовых nodes/marks, custom media nodes и link mark; отключить стандартный TipTap history при Collaboration/Yjs.
- [ ] 3.4 Зафиксировать attrs/defaults/validation `image`: generated stable `nodeId`, HTTPS `src` без credentials, `alt`, `decorative`, optional `caption`, `alignment` и integer `widthPercent` 25–100; покрыть invalid combinations и boundary values tests.
- [ ] 3.5 Зафиксировать attrs/defaults/validation `youtube`: generated stable `nodeId`, normalized allowlisted video ID вместо URL/iframe HTML, optional caption/alignment/widthPercent; покрыть normalisation supported URLs и invalid hosts/IDs tests.
- [ ] 3.6 Зафиксировать attrs/defaults/validation `video`: generated stable `nodeId`, HTTPS MP4/WebM source без credentials, optional caption/alignment/widthPercent; покрыть invalid protocol/format tests.
- [ ] 3.7 Реализовать node ID lifecycle: генерация при insertion, сохранение при edit/resize/move, deconflict на clone/paste/import и доступность для derived JSON/static mappings; покрыть unit tests.
- [ ] 3.8 Реализовать link normalization для HTTPS/HTTP/mailto и безопасный rendering external links с `rel='noopener noreferrer'`; покрыть запрещённые schemes tests.
- [ ] 3.9 Реализовать deterministic non-editor HTML/static mappings для каждого custom node/mark без React NodeView: `figure`/caption/image/video, privacy-enhanced YouTube iframe и link output.
- [ ] 3.10 Добавить fixture tests `Y.Doc → TipTap JSON → static mappings` для schema v1, field, node IDs, widthPercent и deterministic output без монтирования interactive editor; не создавать public route или publication snapshot writer.
- [ ] 3.11 Добавить schema mismatch, missing-field и corrupted Yjs state tests: session блокирует surface и не заменяет state пустым document; зафиксировать version-bump/migration policy для несовместимых изменений.

## 4. Minimal document session и lifecycle cleanup

- [ ] 4.1 Определить transport-neutral `PageDocumentSession` только с `doc`, `editable`, status `loading|ready|error`, typed error и `destroy()`; не добавлять в общий type dirty/save/retry/flush или Hocuspocus connection/sync states.
- [ ] 4.2 Реализовать `InMemoryPageDocumentSession` и fake test helper для unit tests, Storybook и isolated development без document API/WebSocket/persistence lifecycle.
- [ ] 4.3 Реализовать `PageEditor`/`PageEditorSurface` boundary: surface получает только ready Y.Doc и editable presentation props и не знает transport, persistence или connection diagnostics.
- [ ] 4.4 Реализовать идемпотентный cleanup при page identity change, unmount и replacement session: Y.Doc/editor listeners, local UI timers/pending callbacks, TipTap editor и временный Y.Doc.
- [ ] 4.5 Добавить tests, подтверждающие, что callbacks уничтоженной session не меняют replacement session и не создают stale editor/listener/timer effects.
- [ ] 4.6 Добавить architecture contract test будущей replaceability: fake transport предоставляет тот же minimal ready-doc boundary без изменения schema или `PageEditorSurface`; не реализовывать Hocuspocus adapter.

## 5. TipTap surface, media security и доступные interactions

- [ ] 5.1 Реализовать базовые formatting, Yjs-compatible local undo/redo и presentation-only read-only state; отсутствие client-side controls не объявлять authorization boundary.
- [ ] 5.2 Реализовать BubbleMenu, slash menu и link form с keyboard flows, безопасными errors и корректным focus return.
- [ ] 5.3 Реализовать URL-only image/YouTube/video insertion и deterministic fallback; не добавлять file upload, base64 media или arbitrary iframe content.
- [ ] 5.4 Применить renderer-compatible media security attrs: privacy-enhanced YouTube origin, fixed iframe attrs, image/iframe referrer policy, native video controls/preload и CSP target `img-src`, `media-src`, `frame-src`, `object-src` из design.
- [ ] 5.5 Реализовать top-level pointer drag handle и keyboard-reachable `Move up`/`Move down` через общий transaction path; исключить самостоятельные handles у вложенных list items.
- [ ] 5.6 Добавить RTL/accessibility tests для keyboard slash menu, link/media errors, focus return, status live regions, read-only controls, keyboard move actions, disabled boundaries и pointer reorder parity.

## 6. Dependency, security и completion verification

- [ ] 6.1 Проверить pnpm dependency graph на единственную согласованную версию `yjs` и отсутствие конфликтующих версий/экземпляров `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` и используемых TipTap extensions.
- [ ] 6.2 Добавить CI/checklist verification dependency consistency и runtime identity smoke test там, где duplicate ProseMirror/Yjs instance нарушает collaboration contract.
- [ ] 6.3 Проверить media URL validator, generated static mappings и target CSP/referrer policy against security fixtures; расширение host/protocol allowlist требует отдельного review.
- [ ] 6.4 После разрешённой реализации запустить детерминированные unit/RTL tests несколько раз, включая Yjs field round-trip, static-renderability fixtures, node ID lifecycle, cleanup и accessibility flows.
- [ ] 6.5 Запустить `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Steiger и relevant web checks.
- [ ] 6.6 Запустить `openspec validate add-web-page-editor-core --strict`, получить human review implementation и архивировать change только после выполнения текущих tasks, CI и review.

## Follow-up work — не является задачами этого change

- Отдельный Hocuspocus change реализует provider/server, connection/sync diagnostics, effective permissions и production composition. `synced` с collaboration server не будет интерпретироваться frontend как PostgreSQL durability guarantee.
- Отдельный publication change создаст immutable derived TipTap JSON при publish и public Next.js renderer без per-request Yjs decode.
- Отдельный asset change свяжет уже сохранённые media `nodeId` с `PAGE_ASSETS` и определит uploads/asset lifecycle.
- Если снова понадобится REST editor, отдельный reviewed change определит REST-specific save lifecycle и single-writer protection; он не расширяет base `PageDocumentSession`.
