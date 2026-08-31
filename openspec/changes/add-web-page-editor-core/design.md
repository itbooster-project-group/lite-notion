## Context

См. `proposal.md` и delta spec `web-page-editor`. Backend хранит opaque binary Yjs state, а `docs/database-schema.md` уже различает mutable рабочий документ и immutable publication snapshot с derived TipTap JSON. В текущем workspace editor отсутствует; issues #44 и #45 ещё не дают effective permissions или Hocuspocus room.

PR #66 содержит planning artifacts и реализацию editor core в одной ветке. Полный document REST API не имеет revision/locking semantics и после решения не выпускать REST editor не нужен editor core: сложный frontend bridge был бы disposable code без user flow. Во время ручного QA `InMemoryPageDocumentSession` временно монтировалась вместо workspace placeholder без transport или production persistence; после проверки mount удалён и placeholder восстановлен.

Authoritative document metadata уже разделена: `PAGE_DOCUMENTS.tiptap_schema_version` хранит версию TipTap/ProseMirror application schema, а `PAGE_DOCUMENTS.yjs_state` — binary Yjs state. `Y.Doc` сам по себе не содержит надёжного утверждения о schema version; отдельный metadata mechanism внутрь Y.Doc этим change не вводится.

## Goals / Non-Goals

**Goals:**

- Сделать schema v1 и Yjs collaboration field явным persisted contract вне widget.
- Изолировать TipTap surface от любого transport, не выравнивая несопоставимые REST и Hocuspocus persistence semantics.
- Оставить `Y.Doc` единственным authoritative mutable state без TipTap JSON или TanStack Query mutable store.
- Зафиксировать static-renderability, stable media node IDs, normalized width semantics, security и keyboard reorder до появления persisted editor data.
- Дать editor core проверяемую in-memory/fake session для unit tests, Storybook и development isolation.

**Non-Goals:**

- Production transport, document API и persistence lifecycle в пользовательском workspace в PR #66.
- Frontend REST lifecycle: document GET/PUT, autosave, debounce, retries, `flush`, `beforeunload`, payload-size handling, AbortController и межвкладочная политика.
- Подключение редактора к `WorkspaceMain` или замена placeholder.
- Hocuspocus provider/server, WebSocket transport, awareness, presence, reconnect, effective permissions или PostgreSQL persistence guarantees.
- Public Next.js route, фактическая генерация publication snapshot, production static renderer и `PAGE_ASSETS` integration.
- Backend endpoints, migrations, uploads, private assets и durable offline queue.
- Полная keyboard accessibility всего ProseMirror продукта; фиксируются конкретные keyboard flows, включая альтернативу drag-and-drop.

Временный workspace mount использовался только для ручной проверки editor UI, не менял server resources и после проверки был удалён. Финальный workspace этой ветки сохраняет placeholder до будущей reviewed Hocuspocus composition.

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
    in-memory-page-document-session.ts
  ui/
    page-editor-surface/
    bubble-menu/
    slash-menu/

widgets/page-editor/
  ui/
    page-editor.tsx
    editor-status.tsx
```

Названия файлов могут уточняться при implementation review, но ownership обязателен:

- `entities/page-document` владеет schema version, collaboration field, TipTap/ProseMirror contract, Yjs conversion и media/link validation. Entity не импортирует feature, widget, transport или React UI.
- `features/page-editing` владеет минимальной session abstraction, in-memory test adapter и TipTap interaction UI. Surface получает готовый `Y.Doc` и `editable`.
- `widgets/page-editor` только компонует session status и surface; он не содержит persisted schema, binary conversion или transport lifecycle.

Альтернатива — поместить document domain в `widgets/page-editor` — отклонена: publication и будущая collaboration начали бы зависеть от UI composition.

### 2. PageDocumentSession содержит только transport-neutral state

Общий contract намеренно минимален:

```ts
type PageDocumentSessionStatus = 'loading' | 'ready' | 'error';

type PageDocumentSession = {
  doc: Y.Doc | null;
  editable: boolean;
  status: PageDocumentSessionStatus;
  error?: DocumentError;
  destroy(): void;
};
```

`PageEditorSurface` зависит только от ready `doc` и presentation `editable`; он не знает, создан ли документ in-memory, восстановлен adapter или подключён collaboration provider. Retry после error создаётся replacement session на уровне composition, а не является persistence method общего type.

REST-specific concepts (`dirty`, `saving`, `saved`, `retrySave`, `flush`, payload limit) не входят в этот contract. Их нельзя навязывать Hocuspocus: будущий `HocuspocusPageDocumentSession` будет иметь собственные connection/sync diagnostics (`connecting`, `connected`, `syncing`, `synced`, `disconnected`, `error`) вне базового editor session API.

Критически, `synced` с collaboration server означает только client/server synchronization. Оно **не** равно подтверждённой записи в PostgreSQL: persistence выполняет Hocuspocus backend по отдельному lifecycle. Frontend не должен выводить Hocuspocus client state как durability guarantee.

```text
InMemory/Fake session ────────────────┐
                                      ├→ PageEditor → PageEditorSurface
future Hocuspocus session (separate) ┘
```

Migration REST → Hocuspocus больше не является задачей этого change. Future Hocuspocus adapter заменит production composition и добавит свою diagnostics UI, не притворяясь REST persistence lifecycle и не переписывая schema/surface.

### 3. Schema metadata, `Y.Doc` и collaboration field образуют admission contract

Рабочий документ состоит из отдельной metadata version и binary state; TipTap/ProseMirror — view/command layer над admitted `Y.Doc`. Authoritative TipTap JSON, block CRUD и mutable copy в TanStack Query не создаются. TipTap Collaboration/Yjs history — единственный undo/redo mechanism; стандартный history extension отключается.

Schema v1 фиксирует две публичные константы:

```ts
export const PAGE_DOCUMENT_SCHEMA_VERSION = 1;
export const PAGE_CONTENT_YJS_FIELD = 'default';
```

`PAGE_CONTENT_YJS_FIELD` — canonical имя `Y.XmlFragment`, используемого TipTap Collaboration `field`. Его используют без неявного default одно и то же значение:

- interactive TipTap editor;
- `Y.Doc → TipTap/ProseMirror JSON` conversion и static-render preparation;
- publication snapshot pipeline;
- future Hocuspocus editor;
- migration/import/conversion utilities.

Admission выполняется до создания `PageEditorSurface`:

```text
PAGE_DOCUMENTS.tiptap_schema_version + PAGE_DOCUMENTS.yjs_state
  → session admission validation
  → supported schema metadata + successfully decoded Y.Doc
  → PageDocumentSession status 'ready'
  → PageEditorSurface
```

Session factory/admission validator в `features/page-editing` сверяет metadata с version constants из `entities/page-document`, декодирует binary state и только затем создаёт ready session. `ready` означает, что schema metadata поддерживается, Yjs state успешно декодирован и document допущен к редактированию. Surface не проверяет database schema version самостоятельно.

Физическое отсутствие top-level shared type в encoded update не является ошибкой: valid empty `Y.Doc` может не содержать materialized `Y.XmlFragment` до первого content update. После decode `doc.getXmlFragment(PAGE_CONTENT_YJS_FIELD)` корректно создаёт/возвращает пустой content root. Blocking error относится только к unsupported schema metadata, corrupted/undecodable Yjs state или incompatible document metadata.

Изменение field визуально сделало бы существующий Y.Doc пустым для editor, поэтому field меняется только с новой schema version и явной migration. Round-trip test проверяет и populated content, и empty `Y.Doc → encode → applyUpdate → getXmlFragment(PAGE_CONTENT_YJS_FIELD)`, подтверждая валидный пустой editor document.

### 4. Schema v1 является static-renderable persisted contract

Одна schema factory и `PAGE_DOCUMENT_SCHEMA_VERSION` используются editor, conversion tests и будущим publication renderer. Базовые nodes/marks: document, text, paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold, italic, strike и inline code.

Новая schema version либо явная compatibility migration обязательны при любом изменении persisted contract: добавлении, удалении или переименовании node/mark type; изменении persisted attrs, их semantics или defaults; изменении `PAGE_CONTENT_YJS_FIELD`. Добавление TipTap node/mark не считается автоматически backward-compatible: старый клиент может получить технически валидный Yjs update с неизвестным ProseMirror type и не суметь безопасно открыть document.

Custom JSON contracts:

| Node/mark | Persisted attrs | Validation и стабильность | Детерминированное представление без NodeView |
| --- | --- | --- | --- |
| `image` | `nodeId`, `src`, `alt`, `decorative`, `caption`, `alignment`, `widthPercent` | `nodeId` — opaque UUID, созданный при вставке; HTTPS URL без credentials; `decorative=true` требует пустой `alt`, иначе `alt` непустой; `alignment ∈ start/center/end`; integer `widthPercent` 25–100 | `figure` с `data-node-id`, `img`, процентной шириной content area и optional `figcaption`; load failure даёт fallback, node не удаляется |
| `youtube` | `nodeId`, `videoId`, `caption`, `alignment`, `widthPercent` | `nodeId` как выше; только normalized ID `[A-Za-z0-9_-]{11}` из allowlisted input host; URL/iframe HTML не сохраняются; те же alignment/widthPercent rules | `figure` с `data-node-id` и iframe, который renderer строит на `https://www.youtube-nocookie.com/embed/{videoId}`, без autoplay, с title и optional `figcaption` |
| `video` | `nodeId`, `src`, `caption`, `alignment`, `widthPercent` | `nodeId` как выше; HTTPS URL без credentials, pathname `.mp4`/`.webm`; те же alignment/widthPercent rules | `figure` с `data-node-id` и native `video controls preload='metadata'`, без autoplay, с optional `figcaption` и fallback |
| `link` mark | `href` | normalized `https:`, `http:` или `mailto:`; прочие protocols отклоняются | `a`; внешние HTTP(S) links получают `target='_blank'` и `rel='noopener noreferrer'`; renderer не доверяет persisted HTML attrs |

`caption` — string или `null`; `widthPercent` — нормализованное целое число, обозначающее процент ширины editor/content area, а не CSS string. Interactive и static renderer трактуют его одинаково; percentage и pixel CSS strings не являются допустимым persisted value.

`nodeId` создаётся один раз при создании custom/media node, сохраняется в TipTap JSON и Yjs state, не меняется при edit, resize, alignment или move и доступен static renderer/publication pipeline. Явное clone/paste/import обязано deconflict-ить ID и выдать новый уникальный `nodeId`; это позволяет позднее связать node с `PAGE_ASSETS` без schema v1 migration.

React NodeView может улучшать interactive editing, но не является единственным renderer. Fixtures проверяют JSON defaults, node IDs, Yjs field и deterministic static output без монтирования React NodeViews. Schema mismatch или decode error создаёт safe error state и не заменяет state пустым document.

### 5. Publication остаётся derived pipeline, а не editor store

Derived TipTap JSON допустим только как явно создаваемый immutable publication artifact:

```text
editable Y.Doc (PAGE_CONTENT_YJS_FIELD)
  → publication-time TipTap / ProseMirror JSON
  → immutable DOCUMENT_RENDERINGS.content_json
  → static renderer
  → deterministic React/HTML output
```

Public Next.js page в future change читает готовый snapshot и не декодирует Yjs на каждый request. Данный change проверяет только schema static-renderability и не создаёт public route, snapshot writer или production renderer.

### 6. External media проходит централизованную security validation

URL parser из document entity принимает только явно разрешённые protocols и не хранит arbitrary iframe HTML. YouTube input hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be` и `www.youtube-nocookie.com`; сохраняется только video ID. Renderer сам создаёт privacy-enhanced embed.

Целевой hosting contract для future editor/public renderer:

- `img-src 'self' https:`;
- `media-src 'self' https:`;
- `frame-src https://www.youtube-nocookie.com`;
- `object-src 'none'`.

Image и iframe получают `referrerPolicy='no-referrer'`; для остального действует document `Referrer-Policy: strict-origin-when-cross-origin`. YouTube iframe получает фиксированные safe `allow`, `allowFullScreen` и title. Строгость текущей policy сохраняется, а расширение host/protocol allowlist требует отдельного security review.

### 7. In-memory session покрывает editor core и lifecycle cleanup

`InMemoryPageDocumentSession` создаёт/получает уже декодированный `Y.Doc` для tests, Storybook и isolated development без backend API. Его factory принимает document и schema metadata, например `createInMemoryPageDocumentSession({ doc, schemaVersion })`, и повторяет metadata admission rule: supported `schemaVersion` даёт `ready`; unsupported version даёт blocking `error`, а surface не монтируется. Fake session отдельно моделирует decode/admission error. Это позволяет проверять schema, commands, history и read-only presentation без внедрения disposable REST persistence code.

При смене page identity, unmount или replacement session выполняется идемпотентный `destroy()`:

1. отписываются Y.Doc и editor listeners;
2. очищаются local UI timers/pending callbacks;
3. уничтожается TipTap editor в surface cleanup;
4. временный `Y.Doc` уничтожается после отсоединения surface.

Callbacks destroyed session становятся no-op и не могут менять состояние replacement session. `AbortController`, network retries и provider disconnect не входят в in-memory core; future Hocuspocus adapter обязан очищать provider/awareness listeners в своём lifecycle.

### 8. Перестановка блоков имеет keyboard alternative

Pointer drag handle доступна для поддерживаемых верхнеуровневых blocks, а тот же command path предоставляется через keyboard-reachable `Move up` и `Move down`. Действия используют одну ProseMirror transaction, отключаются на границах документа и возвращают focus к перемещённому block. Вложенные list items не получают top-level handle.

Tests проверяют accessible names, keyboard reachability, disabled boundaries, selection/focus и изменение порядка без pointer events. Этот contract не заявляет полную accessibility всего ProseMirror продукта.

### 9. Dependency graph и Lucide

Все импортируемые TipTap/Yjs packages явно объявляются в `@lite-notion/web`. CI проверяет согласованные версии `yjs`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/react` и используемых extensions; runtime identity smoke tests добавляются там, где duplicate packages могут нарушить ProseMirror/Yjs identity.

`lucide-react` остаётся принятым локальным набором icons editor UI и не заменяется. Hocuspocus packages не добавляются этим change.

## Risks / Trade-offs

- [Нет frontend REST round-trip verification] → API integration при необходимости оформляется отдельным change; editor core проверяется через in-memory Yjs fixtures.
- [Hocuspocus status не попадёт в общий status UI автоматически] → это намеренно: будущий adapter добавляет connection/sync diagnostics без ложной durability семантики.
- [Schema v1 рано фиксирует attrs] → `nodeId`, `widthPercent` и collaboration field добавлены до массового persistence; последующие несовместимые изменения требуют version bump/migration.
- [External media может исчезнуть или раскрыть IP host] → validation, explicit allowlist, CSP/referrer policy и deterministic fallback; uploads/private assets вне scope.
- [Static renderer может разойтись со schema] → общая schema/field constants и fixture tests; public integration остаётся отдельным review.

## Migration Notes / Future Changes

- Future Hocuspocus change реализует provider и собственные connection/sync semantics, подключит adapter к production composition и не введёт REST editable persistence. До допуска клиента к полноценной editing/collaboration session adapter валидирует `PAGE_DOCUMENTS.tiptap_schema_version`; Yjs protocol validity не заменяет TipTap/ProseMirror application-schema compatibility. `synced` не будет сообщаться как PostgreSQL durability.
- Future publication change создаст immutable derived JSON при publish и public Next.js renderer без per-request Yjs decode.
- Future asset change сможет связать `PAGE_ASSETS` с уже сохранённым media `nodeId`; uploads и asset lifecycle не являются задачами этого change.
- Если снова понадобится REST bridge, это отдельный reviewed change с собственными REST-specific state/capabilities и single-writer design; он не изменяет базовый `PageDocumentSession`.
