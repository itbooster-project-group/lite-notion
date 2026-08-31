## Context

См. `proposal.md` и delta spec `web-page-editor`. Backend уже хранит opaque binary state, полученный через `Y.encodeStateAsUpdate`, и ограничивает декодированный document payload значением `DOCUMENT_MAX_BYTES = 1 MiB`. В `docs/database-schema.md` зафиксированы две разные модели: mutable рабочий документ на Yjs и immutable publication snapshot с derived TipTap JSON для public static rendering.

Issues #44 и #45 ещё не предоставляют effective permissions и Hocuspocus room. Полный REST `GET`/`PUT` не имеет revision/locking contract, поэтому его нельзя безопасно выпускать как concurrent editor. Текущий PR #66 должен остаться planning-only: описанные ниже модули, dependencies и tests реализуются только после нового human review.

## Goals / Non-Goals

**Goals:**

- Сделать persisted document schema самостоятельным долгоживущим contract, которым владеет document entity, а не widget.
- Отделить session/transport lifecycle от TipTap UI так, чтобы migration REST → Hocuspocus заменяла adapter без переписывания schema и editor surface.
- Оставить `Y.Doc` единственным authoritative mutable state и исключить competing TipTap JSON/Query stores и competing undo stacks.
- Заранее определить static-renderable JSON contracts, security rules, lifecycle cleanup, race protection, payload limits и доступную перестановку блоков.
- Ограничить REST bridge изолированной реализацией и тестами без production route integration.

**Non-Goals:**

- Любая production-реализация в PR #66.
- Подключение редактора к `WorkspaceMain` или замена текущего placeholder.
- Hocuspocus provider/server, WebSocket transport, awareness, presence, reconnect и effective permissions.
- Публичная Next.js page, генерация publication snapshot и сам static renderer.
- Backend endpoints, revision protocol, database migrations, uploads, private assets и durable offline queue.
- Заявление полной keyboard accessibility редактора; этот change гарантирует конкретные keyboard flows, включая альтернативу drag-and-drop.

## Decisions

### 1. Persisted document model не принадлежит widget

Целевая FSD-декомпозиция:

```text
entities/page-document/
  model/
    editor-schema.ts
    schema-version.ts
  lib/
    yjs-state.ts
    media-validation.ts

features/page-editing/
  model/
    page-document-session.ts
    rest-page-document-session.ts
  ui/
    page-editor-surface/
    bubble-menu/
    slash-menu/

widgets/page-editor/
  ui/
    page-editor.tsx
    editor-status.tsx
```

Названия файлов могут уточняться при implementation review, но ownership является обязательным:

- `entities/page-document` владеет schema version, TipTap/ProseMirror schema contract, Yjs serialization и media/link validation. Entity не импортирует feature, widget, REST или Hocuspocus.
- `features/page-editing` владеет document session abstraction, transport adapters и TipTap interaction UI. Surface зависит только от готового `Y.Doc`, `editable` и editor callbacks.
- `widgets/page-editor` только выбирает/получает session, компонует status и surface и не содержит persisted schema, binary conversion, autosave queue или transport details.

Альтернатива — держать всё в `widgets/page-editor` — отклонена: widget превратился бы в доменный модуль, а publication и Hocuspocus начали бы зависеть от UI composition.

### 2. Document session является границей transport lifecycle

Feature определяет transport-neutral contract примерно такого уровня:

```ts
type DocumentStatus =
  | "loading"
  | "ready"
  | "dirty"
  | "saving"
  | "saved"
  | "load-error"
  | "save-error"
  | "unsupported-schema"
  | "document-too-large"
  | "read-only";

type PageDocumentSession = {
  doc: Y.Doc | null;
  status: DocumentStatus;
  editable: boolean;
  error?: DocumentError;
  retry(): void;
  flush(reason: "navigation" | "explicit"): Promise<FlushResult>;
  destroy(): void;
};
```

Точный React binding может отличаться, но adapter владеет созданием/загрузкой `Y.Doc`, persistence, status transitions, retry и cleanup. `PageEditorSurface` получает только готовый `doc` и presentation props и не знает, использовались ли REST, WebSocket, IndexedDB или другой transport.

```text
Generated document API → RestPageDocumentSession ┐
                                                  ├→ PageEditor → PageEditorSurface
Hocuspocus provider    → HocuspocusPageDocumentSession ┘
```

REST adapter в этом change реализуется только как изолированный seam с unit/integration tests и не экспортируется через production workspace composition. В будущем change Hocuspocus adapter становится единственным production persistence lifecycle; REST autosave удаляется, а session contract, schema и surface сохраняются.

Альтернатива — вызывать REST прямо из `PageEditor` — отклонена, потому что transport migration затронула бы composition и status UI. Хранить mutable `Y.Doc` или его snapshots в TanStack Query также запрещено: Query может обслуживать обычные server resources, но не становится вторым editor store.

### 3. `Y.Doc` остаётся единственным editable source of truth

Рабочий документ хранится и передаётся как binary Yjs update. TipTap/ProseMirror работает как view/command layer над тем же `Y.Doc`. Authoritative TipTap JSON, block CRUD и зеркальная копия content в TanStack Query не создаются.

TipTap Collaboration/Yjs history является единственным undo/redo mechanism. Стандартный history extension из StarterKit отключается, чтобы не создавать competing undo stack.

Derived TipTap JSON допустим только как явно создаваемый immutable publication artifact. Public Next.js page должна читать готовый snapshot и не декодировать Yjs на каждый request:

```text
editable Y.Doc
  → publication-time TipTap / ProseMirror JSON
  → immutable DOCUMENT_RENDERINGS.content_json
  → static renderer
  → deterministic React/HTML output
```

Создание snapshot, public route и static renderer находятся вне scope, но schema v1 обязана поддерживать этот pipeline до начала editor implementation.

### 4. Schema v1 является persisted и static-renderable contract

Одна schema factory и одна публичная schema version используются editor, Yjs conversion tests и будущим publication renderer. Базовые nodes/marks фиксируются версией: document, text, paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold, italic, strike и inline code. Изменение names, attrs, defaults или semantics требует новой schema version либо явной migration.

Custom JSON contracts:

| Node/mark | Persisted attrs | Validation | Детерминированное представление без NodeView |
| --- | --- | --- | --- |
| `image` | `src`, `alt`, `decorative`, `caption`, `alignment`, `width` | normalized HTTPS URL без credentials; `decorative=true` требует пустой `alt`, иначе непустой `alt`; `alignment ∈ start/center/end`; integer `width` 25–100 | `figure` с `img`, фиксированными data/style attrs и optional `figcaption`; ошибка загрузки даёт fallback, node не удаляется |
| `youtube` | `videoId`, `caption`, `alignment`, `width` | только normalized ID `[A-Za-z0-9_-]{11}`, полученный из allowlisted input host; URL/iframe HTML не сохраняются; те же alignment/width rules | `figure` и iframe, который renderer сам строит на `https://www.youtube-nocookie.com/embed/{videoId}`, без autoplay, с title и optional `figcaption` |
| `video` | `src`, `caption`, `alignment`, `width` | normalized HTTPS URL без credentials, pathname оканчивается на `.mp4` или `.webm`; те же alignment/width rules | `figure` и native `video controls preload="metadata"` без autoplay, с optional `figcaption` и fallback |
| `link` mark | `href` | normalized `https:`, `http:` или `mailto:`; иные protocols отклоняются | `a`; внешние HTTP(S) links получают `target="_blank"` и `rel="noopener noreferrer"`, renderer не доверяет persisted HTML attrs |

`caption` хранится как string либо `null`; defaults attrs фиксируются schema tests. React NodeView может улучшать interactive editing, но не является единственным renderer: у каждого custom node/mark обязаны быть deterministic HTML/static mappings. Fixture tests проверяют одинаковую нормализацию JSON и deterministic output без монтирования editor React NodeViews.

При schema mismatch или ошибке Yjs decode session переходит в блокирующее typed state, не создаёт editable surface и не выполняет save. Неизвестный persisted state никогда не заменяется пустым документом.

### 5. External media проходит централизованную security validation

URL parser из document entity принимает только явно разрешённые protocols и никогда не хранит arbitrary iframe HTML. Для YouTube input разрешены `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be` и `www.youtube-nocookie.com`; parser извлекает только video ID. Renderer всегда генерирует privacy-enhanced embed самостоятельно.

Целевой hosting contract для editor/public renderer:

- `img-src 'self' https:`;
- `media-src 'self' https:`;
- `frame-src https://www.youtube-nocookie.com`;
- `object-src 'none'`.

Image и iframe получают `referrerPolicy="no-referrer"`; для элементов/переходов без собственного атрибута действует документный `Referrer-Policy: strict-origin-when-cross-origin`. YouTube iframe получает минимальный фиксированный `allow`, `allowFullScreen`, безопасный title и не принимает attrs из пользовательского HTML. Link renderer добавляет безопасный `rel` при `_blank`.

CSP/referrer policy должны быть проверены при будущем подключении renderer к route. Если текущая application policy строже, она сохраняется; расширение allowlist требует отдельного security review.

### 6. REST bridge ограничен и не выпускается пользователям

`RestPageDocumentSession` напрямую вызывает generated document API для bootstrap/save и не помещает state в Query cache. Load использует `AbortController` и session generation. State применяется к новому `Y.Doc` до регистрации update listener, чтобы bootstrap не помечал документ dirty.

Autosave после implementation review работает как debounce 750 мс и single-flight latest-snapshot queue: параллельных PUT одной session нет, а update во время request формирует один следующий актуальный snapshot. Ошибка сохраняет dirty state и допускает explicit retry без показа raw backend body.

Перед каждым PUT adapter вычисляет `Y.encodeStateAsUpdate(doc)` и проверяет длину бинарного `Uint8Array` против `DOCUMENT_MAX_BYTES` (1 MiB). Превышение создаёт typed error `document-too-large`, отменяет enqueue/retry для неизменившегося oversized state и показывает persistent blocking indication. После уменьшения документа и нового валидного snapshot сохранение может быть явно возобновлено. Chunked base64 conversion предотвращает переполнение argument stack, но не меняет и не обходит API payload limit.

REST API не имеет revision/locking semantics. Поэтому принято deployment constraint вместо неполной межвкладочной блокировки: adapter не импортируется production workspace, route или widget entry point, и пользователь не может запустить REST editing lifecycle. Architecture test проверяет этот import boundary и отсутствие document GET/PUT при открытии текущего workspace placeholder.

Если до Hocuspocus потребуется выпустить REST editor пользователям, это будет новый reviewed change с single-writer mechanism (предпочтительно Web Locks с BroadcastChannel для понятного read-only/warning во второй вкладке). Silent last-write-wins не является допустимым production behavior.

### 7. Сохранение при уходе имеет ограниченные гарантии

При SPA navigation или смене `pageId` composition может вызвать `flush("navigation")` до destruction текущей session. Это best effort: navigation lifecycle не заявляет durable guarantee, а незавершённый request после истечения допустимого lifecycle отменяется cleanup.

При закрытии tab/browser обычный async PUT не считается надёжным. `beforeunload` устанавливается только для dirty/saving/save-error/document-too-large и предупреждает о возможной потере данных; это UX-защита, а не persistence mechanism. Основная гарантия не строится на `fetch(..., { keepalive: true })`, потому что полный Yjs state и base64/JSON overhead могут превышать browser keepalive body limits.

### 8. Session и editor имеют явный cleanup lifecycle

Каждая session получает immutable generation id. Любой GET/PUT callback перед status mutation проверяет active generation и `pageId`; callback старой session не может изменить новый `Y.Doc`, status или error.

При смене `pageId`, unmount, aborted load или создании replacement session выполняется идемпотентный `destroy()`:

1. отписать Y.Doc update listeners;
2. очистить debounce/autosave timers и queued lifecycle state;
3. abort активных load/save requests после допустимого best-effort flush;
4. удалить `beforeunload` и прочие browser listeners;
5. уничтожить TipTap editor в surface cleanup;
6. уничтожить временный/активный `Y.Doc` после отсоединения surface;
7. в будущем — disconnect/destroy Hocuspocus provider и awareness listeners.

Promise completion после destruction становится no-op. Tests с deferred requests и fake timers доказывают отсутствие stale callbacks, saves и listeners после page switch/unmount.

### 9. Перестановка блоков имеет keyboard alternative

Pointer drag handle остаётся удобным способом перемещения поддерживаемых верхнеуровневых blocks, но тот же command path доступен через именованные действия `Move up` и `Move down` в keyboard-reachable block controls. Действия используют одну ProseMirror transaction, отключены на границах документа и возвращают focus к перемещённому block.

Вложенные list items не получают top-level handle. Tests проверяют Tab/keyboard reachability, accessible names, disabled boundaries, сохранение selection/focus и фактическое изменение порядка без pointer events. Остальные заявленные flows BubbleMenu, slash menu, link/media forms и status regions также покрываются keyboard/ARIA tests; полной accessibility всего ProseMirror продукта этот change не обещает.

### 10. Dependency graph должен быть согласован

Все импортируемые TipTap/Yjs packages явно объявляются в `@lite-notion/web`; Hocuspocus packages не добавляются. Lockfile/CI verification проверяет одну согласованную версию `yjs`, а также отсутствие конфликтующих экземпляров/версий `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` и всех используемых TipTap extensions.

Проверка выполняется через pnpm dependency graph/list и runtime identity smoke tests там, где duplicate packages могут нарушить ProseMirror/Yjs identity. Standard history остаётся отключённым при Collaboration/Yjs.

## Risks / Trade-offs

- [REST adapter нельзя проверить через реальный workspace flow] → покрыть contract/integration tests с fake session/API и architecture test; production integration отложить до Hocuspocus.
- [Изолированный REST code может устареть до realtime change] → держать adapter минимальным и удалить его, как только Hocuspocus session проходит общий contract suite.
- [Schema v1 слишком рано закрепит attrs] → фиксировать только необходимые attrs/defaults и требовать version bump/migration для несовместимых изменений.
- [Внешние media всё ещё раскрывают IP внешнему host и могут исчезнуть] → явный URL consent, CSP/referrer policy и deterministic fallback; upload/private assets вне scope.
- [Full-state encoding создаёт allocations до проверки limit] → limit проверяется сразу после обязательного encode; chunked base64 применяется только после успешной binary-size validation.
- [Best-effort navigation flush не гарантирует durable save] → честный status/warning contract; production durability появляется с Hocuspocus, а не маскируется keepalive.
- [Derived JSON может разойтись со schema] → публикационный renderer использует ту же versioned schema и fixture contract tests; snapshot хранит schema version.

## Migration Plan

1. В PR #66 обновить и получить human review только proposal, design, delta spec и tasks; production files не изменять.
2. После отдельного разрешения реализовать schema/entity, surface и session contract по tasks, но оставить REST adapter вне production route и workspace.
3. Проверить общий session contract через fake adapter и изолированный REST adapter, static-renderability fixtures, cleanup/race/security/accessibility и dependency graph.
4. В отдельном Hocuspocus change реализовать `HocuspocusPageDocumentSession`, прогнать тот же contract suite и подключить его к `PageEditor`; не подключать REST autosave параллельно.
5. После publication change создавать immutable derived TipTap JSON при publish и рендерить public Next.js page без per-request Yjs decode.

Rollback до production integration сводится к удалению нового adapter/composition import: persisted Yjs contract и schema не требуют обратной миграции. До Hocuspocus production behavior не меняется, потому что workspace placeholder сохраняется.
