## 1. Подготовка контрактов и зависимости

- [x] 1.1 Проверить фактические TypeScript declarations `@hocuspocus/provider` и `@tiptap/extension-collaboration-caret`, добавить совместимую версию caret в `apps/web/package.json` и обновить `pnpm-lock.yaml` через pnpm
- [x] 1.2 Расширить узкий `CollaborationTransport.provider` до минимального provider-compatible contract для `connect` и Awareness, сохранив существующие callbacks, reconnect и destroy; не добавлять отдельный setter для `Awareness state.user`
- [x] 1.3 Добавить независимые типы `PresenceUser`, `PageDocumentPresence` (`users`/`subscribe`) и `PageDocumentEditorCollaboration` (`provider`/`user`), не экспортируя Hocuspocus-specific API в participants UI
- [x] 1.4 Добавить/обновить transport contract tests: provider exposes only required capabilities, existing connect/auth/disconnect lifecycle remains unchanged

## 2. Presence model и deterministic color

- [x] 2.1 Реализовать pure utility `user.id -> hash -> predefined hex palette` с безопасными fallback и контрастными цветами
- [x] 2.2 Добавить unit tests на одинаковый цвет для повторных вызовов/reconnect, разные user ids, все palette boundaries и отсутствие random behavior
- [x] 2.3 Реализовать безопасный mapper Awareness states -> validated presence users: malformed/empty states и colors вне `^#[0-9a-fA-F]{6}$` игнорируются, users дедуплицируются по `Awareness state.user.id`, clientID не используется как participant identity; representative выбирается по минимальному numeric clientID
- [x] 2.4 Добавить unit tests на dedup нескольких clientID одного user, malformed/empty states, minimum numeric clientID и стабильный порядок результата

## 3. Session lifecycle и current user

- [x] 3.1 Передать authenticated `PresenceUser` из session model в `PageDocumentEditorCollaboration`; не публиковать `Awareness state.user` из collaborative session, оставив user/cursor/selection единоличной ответственностью `CollaborationCaret`
- [x] 3.2 Синхронизировать session presence snapshot по Awareness changes и сохранить presence lifecycle независимым от `editable`, включая viewer
- [x] 3.3 Реализовать guarded Awareness listeners и snapshots; при temporary disconnect сохранять живыми session/provider и существующий reconnect lifecycle
- [x] 3.4 Реализовать полный idempotent cleanup только при page switch, editor/session unmount, logout/session loss или explicit destroy: editor composition owner уничтожает TipTap editor, collaborative session снимает Awareness listeners, очищает subscriptions/snapshots, вызывает `transport.destroy()` и уничтожает `Y.Doc`; сохранить Strict Mode safety
- [x] 3.5 Добавить collaborative session integration tests на Awareness update, viewer presence, temporary disconnect без destroy, reconnect и cleanup listener removal/отсутствие stale users после page switch
- [x] 3.6 Запустить связанные session/model tests и typecheck после завершения model/lifecycle этапа

## 4. Editor integration

- [x] 4.1 Расширить editor extension factory так, чтобы `Collaboration` и official `CollaborationCaret` использовали один `Y.Doc` и один provider из `PageDocumentEditorCollaboration`
- [x] 4.2 Передать `PresenceUser` в `CollaborationCaret`; только `CollaborationCaret` публикует `Awareness state.user`, cursor и selection, а caret/selection rendering заменяет malformed remote color на deterministic fallback, без ручных ProseMirror decorations, отдельного Y.Map или presence lifecycle в JSX
- [x] 4.3 Добавить отдельные `.editorRoot :global(.collaboration-carets__caret)`, `.editorRoot :global(.collaboration-carets__label)` и `.editorRoot :global(.collaboration-carets__selection)` selectors в существующую CSS Module stylesheet и проверить keyboard/read-only behavior
- [x] 4.4 Добавить component tests на remote caret/selection integration boundary, имя/цвет и viewer read-only с видимым presence
- [x] 4.5 Запустить связанные editor component tests и typecheck после подключения extension

## 5. Participants UI

- [x] 5.1 Реализовать compact participants display рядом с существующим collaboration status/header через session presence snapshot, с avatar/initials, name tooltip/popover и deterministic color
- [x] 5.2 Добавить overflow presentation `первые N + "+N"` и доступные labels для screen reader при длинном списке
- [x] 5.3 Добавить component/integration tests на add/update/remove Awareness user, dedup tabs, malformed states, stable order, overflow и cleanup subscription
- [x] 5.4 Проверить FSD imports: UI получает только domain presence contract и не импортирует Hocuspocus/Awareness напрямую

## 6. End-to-end и регрессии

- [x] 6.1 Расширить существующий `page-editor-collaboration` Playwright harness сценарием A с двумя разными authenticated users и явными `PLAYWRIGHT_USER_A/B_ID/NAME`, соответствующими storage states: оба видны в participants UI без reload
- [x] 6.2 В сценарии A добавить проверки remote caret/selection, имени и deterministic color пользователя A, включая viewer/editor permission scenario
- [x] 6.3 Добавить отдельный сценарий B с двумя contexts одного authenticated user: несколько Awareness states/clientID допустимы, participants показывает одну badge, reconnect не создаёт duplicate participant, отдельные remote cursor states сохраняются допустимыми
- [x] 6.4 В сценариях A/B проверить реальный временный network disconnect/reconnect через Playwright offline context, восстановление document/presence без duplicate badge и исчезновение пользователя после закрытия второго context согласно Awareness timeout semantics
- [x] 6.5 Проверить page switch/unmount cleanup в существующем editor/workspace сценарии и отсутствие пользователей старой страницы
- [x] 6.6 Запустить полный связанный web test suite, lint и typecheck; убедиться, что document sync, permissions и отсутствие REST/persistence presence regressions сохранены
- [x] 6.7 Провести финальную проверку `openspec validate add-collaboration-presence --strict` и отметить только реально реализованные и протестированные задачи
