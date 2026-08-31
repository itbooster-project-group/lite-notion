## 1. Review boundary и подготовка

- [ ] 1.1 Получить human review обновлённых `proposal.md`, `design.md`, delta spec и задач до начала реализации; не начинать implementation по этому PR без отдельного подтверждения.
- [ ] 1.2 Сохранить PR #66 planning-only: проверить, что diff не содержит application code, dependency manifests, lockfile, API changes, Hocuspocus packages или workspace integration.
- [ ] 1.3 Перед implementation review сверить текущий `main`, `docs/database-schema.md`, document API limit и актуальные nested `AGENTS.md`; уточнить пути FSD без изменения ownership, заданного design.

## 2. Dependencies и FSD ownership

- [ ] 2.1 Добавить только реально импортируемые TipTap 3/Yjs/Lucide dependencies в `@lite-notion/web`, сохранить существующие icon conventions и обновить lockfile через pnpm; не добавлять Hocuspocus packages.
- [ ] 2.2 Создать `entities/page-document` для schema version, schema factory, Yjs serialization и media/link validation; убедиться, что entity не импортирует feature, widget, transport или React UI.
- [ ] 2.3 Создать `features/page-editing` для document session contract, adapters и TipTap interaction UI; оставить `widgets/page-editor` композиционным слоем status/surface без persisted schema и autosave logic.
- [ ] 2.4 Добавить import-boundary/architecture tests, подтверждающие ownership entity/feature/widget и отсутствие REST adapter import из production workspace/route/widget entry point.

## 3. Persisted schema v1 и static rendering contract

- [ ] 3.1 Реализовать schema version handling и единую schema factory для базовых nodes/marks, custom media nodes и link mark; отключить стандартный TipTap history при Collaboration/Yjs.
- [ ] 3.2 Зафиксировать attrs/defaults/validation `image`: HTTPS `src` без credentials, `alt`, `decorative`, optional `caption`, `alignment` и `width`; покрыть invalid combinations и boundary values tests.
- [ ] 3.3 Зафиксировать attrs/defaults/validation `youtube`: хранить только normalized allowlisted video ID, а не URL или iframe HTML; покрыть normalisation всех supported YouTube input URLs и invalid hosts/IDs tests.
- [ ] 3.4 Зафиксировать attrs/defaults/validation `video`: HTTPS `src` без credentials, только MP4/WebM pathname, optional `caption`, `alignment` и `width`; покрыть invalid protocol/format tests.
- [ ] 3.5 Реализовать link normalization для HTTPS/HTTP/mailto и безопасный rendering `_blank` links с `rel="noopener noreferrer"`; покрыть запрещённые schemes tests.
- [ ] 3.6 Реализовать deterministic non-editor HTML/static mappings для каждого custom node/mark без зависимости от React NodeView: `figure`/caption/image/video, privacy-enhanced YouTube iframe и link output.
- [ ] 3.7 Добавить fixture tests `Y.Doc → TipTap JSON → static renderer` для schema v1, проверяющие deterministic output, attrs и rendering всех custom nodes без монтирования interactive editor.
- [ ] 3.8 Добавить schema mismatch и corrupted Yjs state tests: session блокирует surface и не выполняет save/empty-state overwrite; зафиксировать migration/version-bump policy для несовместимых изменений.
- [ ] 3.9 Зафиксировать publication boundary test/documentation: derived TipTap JSON создаётся только для immutable snapshot, а public renderer не импортирует Yjs decode/editor stack для каждого request.

## 4. Document session abstraction и cleanup lifecycle

- [ ] 4.1 Определить transport-neutral `PageDocumentSession`, `DocumentStatus`, `DocumentError`, `FlushResult` и presentation `editable` contract без REST/Hocuspocus imports в `PageEditorSurface`.
- [ ] 4.2 Реализовать test fake session adapter и общий contract suite, которым будут проверяться REST и будущий Hocuspocus adapters без переписывания schema/surface.
- [ ] 4.3 Реализовать session generation/pageId isolation и `AbortController` handling для load/save callbacks; старые callbacks не должны менять новый document, status или error.
- [ ] 4.4 Реализовать идемпотентный cleanup при pageId change, unmount, aborted load и replacement session: Y.Doc listeners, debounce timers, pending state, browser listeners, requests, TipTap editor и временный `Y.Doc`.
- [ ] 4.5 Добавить deferred-promise/fake-timer tests отсутствия stale GET/PUT callbacks, extra autosave, listeners и status mutation после page switch/unmount/replacement.
- [ ] 4.6 Задокументировать в adapter contract future cleanup Hocuspocus provider/awareness listeners и добавить contract test, который доказывает заменяемость REST session без изменения `PageEditorSurface`.

## 5. Временный REST session без production release

- [ ] 5.1 Реализовать Yjs binary serialization helpers и chunked browser base64 conversion в document entity; проверить round-trip пустого и непустого state без превышения argument stack.
- [ ] 5.2 Реализовать `RestPageDocumentSession` на generated document API только для изолированных tests/development seam: bootstrap, schema/decode validation, ready/load-error/retry states; не добавлять backend endpoints/DTO/migrations.
- [ ] 5.3 Реализовать debounce 750 мс и single-flight latest-snapshot queue: один PUT на session, update during save создаёт только следующий актуальный snapshot, retry не теряет dirty state.
- [ ] 5.4 Проверять `Y.encodeStateAsUpdate(doc).byteLength` до base64/PUT против `DOCUMENT_MAX_BYTES`; добавить typed `document-too-large`, blocking UI state и прекращение autosave retry, пока document не станет допустимым.
- [ ] 5.5 Реализовать `flush("navigation")` как best-effort перед destruction и `beforeunload` warning для dirty/saving/error/oversized state; не использовать keepalive full-state PUT как persistence guarantee.
- [ ] 5.6 Добавить REST adapter tests для empty/non-empty bootstrap, decode/schema failure, debounce, single-flight queue, update during save, retry, 1 MiB overflow, resumed save после уменьшения state, navigation flush и browser-close semantics.
- [ ] 5.7 Добавить production-boundary integration test: существующий `WorkspaceMain` сохраняет placeholder и не выполняет document GET/PUT; REST adapter не импортируется из user-facing route/widget.
- [ ] 5.8 До Hocuspocus не подключать REST adapter к production composition. Если такой выпуск потребуется, остановить implementation и открыть новый reviewed change с single-writer design (Web Locks/BroadcastChannel или эквивалент) вместо silent last-write-wins.

## 6. TipTap surface и доступные interactions

- [ ] 6.1 Реализовать `PageEditorSurface`, BubbleMenu, slash menu, link form и status presentation так, чтобы surface получала только session `Y.Doc`/editable props и не знала transport/persistence.
- [ ] 6.2 Реализовать базовые formatting, local Yjs-compatible undo/redo и presentation-only read-only state; убедиться, что отсутствие client-side controls не объявляется authorization boundary.
- [ ] 6.3 Реализовать URL-only image/YouTube/video insertion и deterministic fallback; не добавлять file upload, base64 media или arbitrary iframe content.
- [ ] 6.4 Применить renderer-compatible media security attrs: privacy-enhanced YouTube origin, fixed iframe attrs, image/iframe referrer policy, native video controls/preload и CSP target `img-src`, `media-src`, `frame-src`, `object-src` из design.
- [ ] 6.5 Реализовать top-level pointer drag handle и keyboard-reachable `Move up`/`Move down` через общий transaction path; исключить самостоятельные handles у вложенных list items.
- [ ] 6.6 Исправить media focus flow: не фокусировать ProseMirror перед открытием media form, передавать focus в первое поле и возвращать его только после закрытия формы.
- [ ] 6.7 Добавить RTL/accessibility tests для keyboard slash menu, link/media errors, focus return, status live regions, read-only controls, keyboard move actions, disabled boundary actions и pointer reorder parity.

## 7. Dependency, security и migration verification

- [ ] 7.1 Проверить pnpm dependency graph на единственную согласованную версию `yjs` и отсутствие конфликтующих версий/экземпляров `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` и всех используемых TipTap extensions.
- [ ] 7.2 Добавить CI/checklist verification dependency consistency и runtime identity smoke test там, где duplicate ProseMirror/Yjs instance нарушает collaboration contract.
- [ ] 7.3 Проверить media URL validator, generated static output и target CSP/referrer policy against security fixtures; расширение host/protocol allowlist требует отдельного review.
- [ ] 7.4 Реализовать/прогнать adapter migration-boundary tests: Hocuspocus-compatible fake session проходит общий contract suite, REST и Hocuspocus persistence mechanisms не монтируются параллельно.
- [ ] 7.5 В отдельном Hocuspocus change заменить REST session adapter на production Hocuspocus session, удалить REST autosave editable lifecycle и только затем рассмотреть замену workspace placeholder.

## 8. Проверка и handoff

- [ ] 8.1 После разрешённой реализации запустить детерминированные unit/RTL tests несколько раз, включая fake timers, deferred requests, static-rendering fixtures и accessibility flows.
- [ ] 8.2 Запустить `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Steiger и relevant web checks; не объявлять Hocuspocus checks частью этого change, пока package не добавлен в отдельном change.
- [ ] 8.3 Запустить `openspec validate add-web-page-editor-core --strict`, проверить dependency graph и убедиться, что REST adapter всё ещё не production-mounted.
- [ ] 8.4 Получить human review implementation и архитектурной migration boundary; синхронизировать specs/архивировать change только после выполнения всех tasks, CI и review.
