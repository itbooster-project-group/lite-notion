## Why

До реализации редактора необходимо зафиксировать устойчивый persisted document contract и границы editor core. Без этого transport-specific REST semantics проникнут в UI, неявный TipTap default сможет визуально скрыть существующий `Y.Doc`, а последующий переход на Hocuspocus потребует переписывать surface и создаст ложное представление о durability.

## What Changes

- Спроектировать schema version 1 как долгоживущий persisted contract: metadata `PAGE_DOCUMENTS.tiptap_schema_version = 1` валидируется отдельно от `PAGE_DOCUMENTS.yjs_state`, а canonical collaboration field фиксируется как `PAGE_CONTENT_YJS_FIELD = 'default'`. `Y.Doc` остаётся единственным editable source of truth.
- Разделить FSD-ответственности между document entity, page-editing feature и композиционным `PageEditor` widget; schema, Yjs serialization и validation не принадлежат widget.
- Ввести минимальный transport-neutral `PageDocumentSession` только с общими `doc`, `editable`, `loading/ready/error` и lifecycle cleanup. Создавший session caller остаётся владельцем её `destroy()`, а `PageEditor` только использует переданный resource. REST save states и Hocuspocus connection/sync states не становятся его общим API.
- Реализовывать editor core с `InMemoryPageDocumentSession`/fake session для tests, Storybook и isolated development. Полноценный frontend REST lifecycle (GET/PUT, autosave, flush, retries, payload checks) не реализуется, потому что не используется production flow и будет заменён Hocuspocus.
- Зафиксировать schema v1 для static rendering: каждый custom node/mark получает стабильный JSON contract, deterministic non-editor mapping, `nodeId` и нормализованный `widthPercent`, доступные будущему publication pipeline; программная и native clipboard insertion используют общий node ID deconflict contract.
- Добавить визуально доступную при keyboard focus альтернативу для перестановки блоков и scoped security contract для ссылок, внешних изображений, direct video и YouTube embeds.
- Подготовить seam для будущего Hocuspocus adapter без production wiring. Hocuspocus connection/sync status и server persistence semantics остаются его собственным contract; `synced` с collaboration server не означает persistence в PostgreSQL.
- Сохранить принятый проектом `lucide-react`; это решение не пересматривается.

Этот PR включает согласованные OpenSpec artifacts и реализацию editor core. Во время ручного QA `InMemoryPageDocumentSession` временно монтировалась вместо workspace placeholder без document API, REST, Hocuspocus или persistence. После проверки editor UI временный mount удалён, placeholder восстановлен, а production integration оставлена будущему reviewed Hocuspocus change.

## Capabilities

### New Capabilities

- `web-page-editor`: Versioned document schema, transport-neutral editor core, доступные editing flows и безопасные external media без production transport.

## Impact

- Frontend после отдельного implementation review: `entities/page-document` владеет schema/Yjs contract; `features/page-editing` — transport-neutral session и editor surface; `widgets/page-editor` — только композицией и status presentation.
- Dependencies после отдельного implementation review: согласованный набор TipTap 3/Yjs extensions и принятый `lucide-react` в `@lite-notion/web`; Hocuspocus packages не добавляются этим change.
- Backend/API: endpoints, DTO, database schema и generated API не меняются. Admission editor document использует уже authoritative пару `PAGE_DOCUMENTS.tiptap_schema_version` и `PAGE_DOCUMENTS.yjs_state`, но не вводит metadata внутрь Y.Doc.
- Publication: будущие immutable snapshots используют derived TipTap JSON для static rendering; editable document не получает authoritative JSON-копию.
- Follow-up: production collaboration, Hocuspocus persistence lifecycle, public route и asset uploads рассматриваются отдельными reviewed changes.
- Текущий PR: planning artifacts и editor core в одной ветке; REST/Hocuspocus transports, public route и production persistence запрещены. Временное in-memory QA-mount удалено, существующий workspace снова показывает placeholder.
