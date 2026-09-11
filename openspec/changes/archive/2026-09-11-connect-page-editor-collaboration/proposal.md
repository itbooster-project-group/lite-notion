## Why

Frontend editor пока не подключён к существующему collaboration runtime: страница показывает placeholder, а document content имеет REST write/autosave path. Нужно включить realtime Yjs editing с корректным auth/reconnect lifecycle, сохранив текущую PageDocumentSession и editor surface.

## What Changes

- Добавить `@hocuspocus/provider` в `apps/web` и transport для комнаты `page:<pageId>`.
- Подключить collaboration session к реальной page composition через публичный auth boundary и `NEXT_PUBLIC_COLLABORATION_URL`.
- Показывать editor только после initial Yjs sync; разделить document state и WebSocket connection state.
- Обработать connecting, connected, reconnecting, offline, authentication failure, disconnect, reconnect и cleanup.
- Убрать frontend REST read/write/autosave для document content; backend `PUT /api/v1/pages/:pageId/document` сохранить без изменений как compatibility path.
- Не использовать REST PUT как fallback при ошибках WebSocket; удалить backend writer отдельным change после collaboration end-to-end проверки.
- Проверить CSP `connect-src`, обычный localhost и LAN startup.
- Добавить полноценный Playwright browser E2E с двумя независимыми browser contexts, реальным UI-путём и проверкой refresh/persistence.
- Сделать session/provider lifecycle безопасным для React StrictMode и повторного mount → cleanup → mount.
- Ограничить `shared/collaboration` generic transport adapter-ом, который принимает готовый `roomName` и не знает page domain.
- Не добавлять awareness UI, avatars, remote cursors или collaboration caret.

## Capabilities

### New Capabilities

- `web-page-editor-collaboration`: realtime frontend page editor session, provider lifecycle, auth refresh и workspace composition.

### Modified Capabilities

- `web-page-editor`: editor открывается из synced collaborative Y.Doc и не создаёт вторую authoritative content copy.
- `web-page-workspace`: page route монтирует editor через FSD-safe composition.
- `page-documents`: frontend больше не пишет document content через REST; backend PUT временно сохраняется.
- `development-runtime`: collaboration URL и LAN process configuration доступны frontend runtime.

## Impact

- `apps/web`: session/transport model, workspace composition, auth public API, CSP, environment и tests.
- `apps/collaboration`: integration tests для frontend-compatible provider lifecycle; runtime API не меняется.
- `apps/api`: REST PUT contract и implementation остаются без изменений до отдельной миграции.
- Workspace manifests, pnpm catalog/lockfile, OpenAPI generated artifacts только при необходимости проверки неизменности.
