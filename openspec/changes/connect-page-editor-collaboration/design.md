## Context

See `proposal.md` and the existing `web-page-editor`, `web-page-workspace`, `page-documents` и `collaboration-runtime` specifications. `apps/collaboration` уже предоставляет Hocuspocus server, page authorization, Yjs persistence и room format `page:<uuid>`. В web есть transport-neutral `PageDocumentSession`, current Y.Doc/Tiptap integration, SessionProvider и пока неиспользуемый page editor widget.

## Goals / Non-Goals

**Goals:**

- Подключить editor к существующему WebSocket runtime без второй content model.
- Сохранить document/editor lifecycle при transient network failures.
- Использовать публичную auth boundary для access-token refresh.
- Перевести штатный web content write path на Yjs collaboration.
- Проверить localhost, LAN и CSP сценарии.

**Non-Goals:**

- Удаление или изменение backend `PUT /api/v1/pages/:pageId/document`; он остаётся compatibility path.
- Awareness UI, avatars, remote cursors, carets, permissions model или offline-first persistence.
- Переписывание `PageEditor`, `PageEditorSurface`, TipTap schema или collaboration server persistence.

## Decisions

### 1. Transport adapter живёт в shared infrastructure

Hocuspocus provider будет изолирован в generic public module `shared/collaboration`. Adapter принимает готовые `roomName`, URL и auth callbacks и не знает о `page`, `pageId` или `page:<id>`. Canonical room name формируется в page-document/page-editing domain перед вызовом adapter.

`features/page-editing` будет работать с небольшим transport contract и создавать `CollaborativePageDocumentSession`, принимающую canonical room name, URL и auth callbacks.

Это сохраняет существующую boundary-проверку: editor core не импортирует `@hocuspocus/provider`, REST API или внутренние auth modules. Альтернатива — импортировать provider прямо в feature — отклонена из-за нарушения FSD и усложнения тестирования.

### 2. Session остаётся единственным владельцем Y.Doc

Session создаёт один Y.Doc и передаёт его Hocuspocus provider и существующим Tiptap extensions. Session snapshot будет observable через `subscribe()`; `status` остаётся `loading/ready/error`, а `connectionStatus` хранится отдельно.

Initial provider `synced` переводит session в `ready`. Provider `status` и disconnect callbacks меняют только connection state после initial sync. Reconnect не создаёт replacement Y.Doc.

### 3. Auth передаётся callback-ами

Публичный `entities/session` contract предоставит получение текущего access token и принудительный refresh. Transport использует текущий token для обычного connect, refreshes при отсутствии token и выполняет не более одной refresh/reconnect попытки после authentication failure. После окончательного отказа session становится offline/error, а auth provider выполняет существующую session-expiry политику.

Token и error reason никогда не логируются и не попадают в UI.

### 4. Composition находится на page/workspace уровне

Новый workspace page-document composition hook/component будет связывать `useSession`, `createCollaborativePageDocumentSession` и существующий `PageEditor`. Он подписывается на session changes, уничтожает session при смене page id и показывает connection indicator отдельно от editor surface.

`PageEditor` и `PageEditorSurface` не получают provider-specific props и не содержат connection/auth logic.

### 5. REST PUT остаётся compatibility writer

Frontend удалит REST read/write/autosave использование для editor content, но API controller, DTO, service, repository method, OpenAPI и tests останутся без изменений. REST PUT не используется как fallback при WebSocket errors. Это временно допускает legacy second writer; backend writer будет удалён отдельным migration change после collaboration end-to-end проверки.

Страница по-прежнему создаёт initial empty document row в API lifecycle. Содержимое штатного migrated editor не читается и не записывается через REST.

### 6. Runtime configuration и CSP используют один источник

`NEXT_PUBLIC_COLLABORATION_URL` добавляется в web env и передаётся в transport без hardcoded fallback. CSP строит `connect-src` из configured API и collaboration origins, включая `ws:`/`wss:` scheme. LAN runner вычисляет WebSocket URL из выбранного LAN host и передаёт exact web origin collaboration runtime.

React composition создаёт session только внутри effect/hook lifecycle, а cleanup является идемпотентным. StrictMode sequence mount → cleanup → mount должна оставлять только второй provider/socket и второй owned Y.Doc.

Provider не добавляет application awareness fields или presence UI. Внутренний provider behavior, необходимый Hocuspocus для protocol lifecycle, не экспонируется редактору.

## Risks / Trade-offs

- [Temporary dual writer] Legacy API PUT всё ещё может изменить state → web editor не вызывает его и не использует как fallback, а backend removal документируется для отдельной последующей миграции.
- [Token expiry during an open socket] Server не переавторизует idle socket сам → reconnect/auth-failure path получает свежий token и ограничивает retry.
- [Provider event ordering] `connected` может наступить до `synced` → readiness меняется только по `synced`, callbacks после destroy игнорируются.
- [CSP misconfiguration] Production/LAN URL может отличаться от build-time env → добавить explicit config tests и fail-safe missing URL state.
- [Test flakiness] WebSocket tests зависят от timing → использовать in-process Hocuspocus server, deterministic wait helpers и cleanup каждого provider/server.
- [Browser E2E environment] Реальный UI E2E требует running web/API/collaboration и seed auth/page data → добавить Playwright project, deterministic fixtures и отдельную команду с явным local runtime prerequisite.
