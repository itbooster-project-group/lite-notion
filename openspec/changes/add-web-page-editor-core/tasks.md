## 1. Dependencies и schema

- [ ] 1.1 Добавить в `@lite-notion/web` только используемые TipTap 3, Yjs и Lucide dependencies, сохранить Hugeicons и обновить lockfile через pnpm без Hocuspocus packages.
- [ ] 1.2 Выборочно перенести schema version 1, link/media validation и Yjs extensions из commit `c9917b6`, сохранив единственную factory и публичную константу версии.
- [ ] 1.3 Перенести и адаптировать детерминированные unit-тесты nodes, marks, URL validation, media attributes, Yjs state и history configuration.

## 2. Editor UI

- [ ] 2.1 Перенести `PageEditorSurface`, BubbleMenu, slash menu, link form, top-level drag handle и URL-only media node views с доступными names и keyboard flows.
- [ ] 2.2 Исправить media focus race: не фокусировать ProseMirror перед открытием media form, возвращать focus только после закрытия и покрыть это full-suite regression test.
- [ ] 2.3 Сохранить presentation-only `canEdit` seam и тесты отсутствия изменяющих controls без объявления client-side authorization boundary.

## 3. Временный REST lifecycle

- [ ] 3.1 Экспортировать существующие generated document functions/DTO через shared API и добавить chunked browser helpers для base64 Yjs state.
- [ ] 3.2 Реализовать публичный `PageEditor` container: GET по `pageId`, проверка schema/decode, создание Y.Doc до surface и безопасные loading/error/unsupported states с retry.
- [ ] 3.3 Реализовать autosave 750 мс с single-flight PUT, latest queued snapshot, save retry, page generation isolation, final unmount save и `beforeunload` для несохранённого состояния.
- [ ] 3.4 Добавить fake-timer/MSW тесты empty/non-empty load, load retry, schema mismatch, decode error, debounce, последовательных PUT, update during save, retry и unload lifecycle.

## 4. Workspace integration

- [ ] 4.1 Заменить editor placeholder активной страницы в `WorkspaceMain` на `PageEditor` с owner-only `canEdit`, не меняя root/project routes, breadcrumbs и heading.
- [ ] 4.2 Обновить workspace RTL/MSW tests: document API вызывается только для `/pages/{pageId}`, editor errors остаются локальными, navigation metadata не скрывается.

## 5. Проверка и review

- [ ] 5.1 Запустить полный Vitest suite несколько раз для focus regression, web typecheck/build, Steiger и repository lint.
- [ ] 5.2 Запустить полный root check set, проверить единственную версию Yjs, отсутствие Hocuspocus dependencies и `openspec validate add-web-page-editor-core --strict`.
- [ ] 5.3 Передать реализацию на human review; после подтверждения синхронизировать specs и архивировать change в том же PR.
