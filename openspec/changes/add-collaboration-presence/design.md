## Context

См. `proposal.md` и `specs/collaboration-presence/spec.md`. На `main` `createCollaborativePageDocumentSession` создаёт `Y.Doc`, передаёт его в `createCollaborationTransport`, владеет reconnect/status и уничтожает transport/doc. `Collaboration` сейчас создаётся в `entities/page-document/model/editor-schema.ts`, а `PageEditorSurface` получает только `doc` и `editable`. `createCollaborationTransport` возвращает provider с искусственно узким контрактом `Pick<HocuspocusProvider, 'connect'>`, поэтому текущий boundary не позволяет безопасно подключить caret и Awareness.

Authenticated user уже доступен из `useSession().user` с полями `id` и `name`; JWT для presence не декодируется. Existing `apps/web/e2e/page-editor-collaboration.spec.ts` создаёт два browser contexts с одной page route и будет расширен тем же setup.

## Goals / Non-Goals

**Goals:**

- Сделать Awareness частью owner lifecycle collaborative document session.
- Дать editor узкий provider-compatible contract для `CollaborationCaret` и отдельный read-only domain stream participants для UI.
- Одинаково поддержать viewer/editor, не связывая presence с `editable`.
- Обеспечить deterministic identity/color, deduplication и safe parsing Awareness.
- Покрыть lifecycle unit/component tests и существующий multi-context Playwright сценарий.

**Non-Goals:**

- Изменения API, Hocuspocus authorization, PostgreSQL schema или persisted Yjs state.
- Новый WebSocket/provider, REST/Socket.IO presence transport или отдельный global presence store.
- Online status вне конкретного документа, history, comments, mentions, follow mode и avatar upload.

## Decisions

### Ownership Awareness и lifecycle

`createCollaborativePageDocumentSession` остаётся единственным владельцем provider-related resources. После создания transport session:

1. получает provider и его `awareness` через transport boundary;
2. подписывает один guarded listener на Awareness changes;
3. преобразует states в `PresenceUser[]` и публикует snapshot через session subscription;
4. на destroy снимает listener/subscriptions, очищает subscriptions/snapshots и уничтожает transport вместе с doc.

Session должна одинаково запускать presence при `editable: false`; `editable` используется только editor command/content boundary. Session НЕ вызывает `provider.setAwarenessField('user', ...)`: единственным владельцем публикации `Awareness state.user`, cursor и selection является `CollaborationCaret`, которому session передаёт `PresenceUser` через editor collaboration contract. Если provider не имеет Awareness или current user невалиден, session безопасно остаётся usable для document collaboration и публикует пустой participants snapshot.

Awareness state — runtime-only metadata. При временном network disconnect provider/session остаются живы, а reconnect и восстановление Awareness выполняются существующими transport/Awareness semantics. Полный cleanup выполняется только при page switch, editor/session unmount, logout/session loss или explicit destroy.

### Минимальный transport/session API

В `shared/collaboration` вводится узкий provider contract, структурно совместимый с нужными настройками TipTap:

```ts
type CollaborationProvider = {
  connect(): void;
  awareness: Awareness | null;
};
```

Фактические типы Hocuspocus v4 должны быть проверены компилятором; если `CollaborationCaret` требует конкретный provider type, boundary экспортирует минимальный type-safe adapter, а не весь Hocuspocus API. `CollaborationTransport.provider` расширяется только до этого контракта. Session наружу отдаёт два независимых контракта:

```ts
type PageDocumentPresence = {
  users: readonly PresenceUser[];
  subscribe(listener: () => void): () => void;
};

type PageDocumentEditorCollaboration = {
  provider: CollaborationProvider;
  user: PresenceUser;
};
```

Participants UI получает только `PageDocumentPresence` (`users` и `subscribe`), поэтому не имеет доступа к Hocuspocus provider/Awareness. `PageEditorSurface` получает только `PageDocumentEditorCollaboration` с минимально необходимым provider-compatible contract и `PresenceUser`. Обработка `Awareness` остаётся внутри session/model.

### Current user → Awareness → CollaborationCaret

```text
useSession().user (id, name)
        │  session creation input
        ▼
collaborative document session
  ├─ deterministic color(user.id)
  └─ exposes Presence + EditorCollaboration contracts
        │
        ▼
PageEditorSurface
  └─ CollaborationCaret.configure({ provider, user: { id, name, color } })
```

`Collaboration` и `CollaborationCaret` создаются в одном editor extension factory, с одним `Y.Doc` и тем же provider. `CollaborationCaret` является единственным владельцем публикации `Awareness state.user`, cursor и selection. Caret extension является единственным механизмом ProseMirror cursor/selection decorations; собственные decorations и Y.Map для cursor position не вводятся. Current user передаётся в extension, но собственный caret не считается remote UI.

Поскольку текущая editor factory принимает только `Y.Doc`, её контракт расширяется до transport-neutral presence/provider option без привязки `PageEditor` к Hocuspocus. In-memory session/test helpers используют no-op или тестовый provider contract.

### Awareness states → participants

Session/model читает `awareness.getStates()`, безопасно проверяет форму `state.user`, отбрасывает empty/malformed entries и не доверяет Awareness для authorization. Remote caret states остаются привязаны к numeric `clientID`, поэтому две вкладки одного user могут иметь два caret. Для participants model группирует валидные states по `state.user.id`, выбирает state с минимальным numeric `clientID` как deterministic representative, сортирует итог по стабильному ключу (`user.id`) и возвращает immutable snapshot.

Participants widget подписывается на session presence snapshot, показывает первые пять участников и `+N` сверх лимита. Имя доступно через существующий shadcn/ui tooltip/popover convention; UI не содержит parsing/deduplication logic.

### Цветовая utility

В `features/page-editing` или ближайшем domain model создаётся pure utility `getPresenceColor(userId)`: стабильный non-cryptographic hash строки выбирает hex color из фиксированной контрастной palette. Utility не использует `Math.random`, не зависит от render order и покрывается таблицей повторных/разных id. Тот же resolved color передаётся в Awareness, CollaborationCaret и participant avatar.

### UI и стили

Participants composition размещается в существующей области collaboration status/header рядом с `data-collaboration-status`, не меняя workspace routing. Presence UI не владеет session и не создаёт independent lifecycle. Поскольку CollaborationCaret создаёт DOM с фиксированными class names, в existing `page-editor-surface.module.css` используются локально scoped global selectors под локальным root class:

```css
.editorRoot :global(.collaboration-carets__caret) { ... }
.editorRoot :global(.collaboration-carets__label) { ... }
.editorRoot :global(.collaboration-carets__selection) { ... }
```

Глобальные несвязанные selectors не добавляются. Цвет caret/label/selection задаётся extension/user color, а selection получает умеренную opacity для читаемости текста.

### Cleanup и transitions

Session lifecycle guard защищает Awareness callbacks от публикации после destroy. Temporary disconnect не вызывает cleanup: provider/session остаются живы и используют существующий reconnect lifecycle; стандартные Awareness semantics удаляют remote state по timeout/disconnect и восстанавливают local state после reconnect. Page change создаёт новую session, старый owner сначала отписывает editor/UI, затем вызывает `destroy`. Полный destroy выполняет unsubscribe Awareness listeners, очистку subscriptions/snapshots, destroy editor/provider и destroy `Y.Doc`; cleanup должен быть идемпотентным и безопасным при React Strict Mode replay. Logout/session loss инициирует тот же owner cleanup через существующую composition lifecycle. Provider destroy не вызывается participants UI.

### FSD placement

- `shared/collaboration`: low-level Hocuspocus provider contract и создание transport.
- `features/page-editing/model`: `PresenceUser`, deterministic color, Awareness parsing/deduplication, `PageDocumentPresence` и `PageDocumentEditorCollaboration` lifecycle.
- `entities/page-document/model`: editor extension factory получает только editor collaboration contract и подключает official CollaborationCaret.
- `features/page-editing/ui`/существующий editor composition: participants display and caret-local styles.
- `pages/workspace`: только передаёт current user/session contract и композирует существующий editor/status; не обрабатывает Awareness states.

Не вводить Zustand/global client store: один документ имеет одного session owner, а React subscriptions достаточно для editor и participants в рамках текущего page composition. Направление связей: `collaborative session ├── presence → participants UI └── editorCollaboration → PageEditorSurface → CollaborationCaret`.

### Dependencies, authorization и realtime

Добавляется только `@tiptap/extension-collaboration-caret` совместимой с текущим TipTap major версии, с обновлением lockfile через pnpm. Никаких backend/API changes и realtime events вне существующего Hocuspocus Awareness protocol не требуется. Awareness fields не являются permission input; read/write capability по-прежнему определяется backend/Hocuspocus и существующим `editable` mapping.

## Risks / Trade-offs

- [Risk] Hocuspocus v4 provider и CollaborationCaret имеют несовпадающие TypeScript contracts → [Mitigation] проверить фактические declarations при добавлении boundary; экспортировать structural narrow adapter и не обходить типизацию assertions/`any`.
- [Risk] Awareness state может быть неполным или конфликтовать между вкладками → [Mitigation] runtime schema guard, dedup по `user.id`, deterministic representative/order и тесты malformed/multi-client states.
- [Risk] Selection/caret CSS может ухудшить читаемость или overflow label → [Mitigation] module-scoped styles, contrast-reviewed palette, opacity selection и bounded participant UI.
- [Risk] Reconnect создаст transient duplicate или stale snapshot → [Mitigation] derive snapshots from current `getStates()` on every Awareness change, dedup by user id, clear on session destroy and assert reconnect E2E.
- [Risk] Presence availability could accidentally gate viewer/editor → [Mitigation] initialize presence independently from `editable`; permission tests assert viewer is read-only but present.
- [Risk] Frequent Awareness events cause excessive React renders → [Mitigation] immutable snapshot comparison and one session-level subscription; participants UI renders only when deduped users change.

## Migration Plan

1. Add the compatible caret dependency and provider/session contract behind existing editor composition.
2. Add model/unit tests and component tests before enabling the UI in the page editor.
3. Enable caret, participant UI and scoped styles for both viewer/editor, then run existing collaboration E2E plus the presence scenarios.
4. Rollback is a frontend deployment rollback: remove the caret/participants composition while retaining unchanged Yjs/Hocuspocus document collaboration. No data migration or backend rollback is needed.

## Open Questions

Нет: provider boundary, participant limit (5), deterministic ordering, fallback behavior and lifecycle ownership are fixed in this design.
