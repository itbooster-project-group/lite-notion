## Why

Активная страница в web workspace пока показывает только заглушку, хотя backend уже хранит полный Yjs state документа и публикует защищённые операции чтения и замены. Нужно перенести готовое ядро TipTap/Yjs-редактора на актуальный `main` и дать одному клиенту безопасное временное сохранение до появления Hocuspocus, permissions и realtime lifecycle из issue #46.

## What Changes

- Добавить самостоятельный TipTap/Yjs editor widget со schema version 1, базовым форматированием, ссылками, slash menu, BubbleMenu, локальной историей и перетаскиванием верхнеуровневых блоков.
- Добавить URL-only image, YouTube и direct MP4/WebM nodes с безопасной валидацией, metadata, выравниванием и resize без загрузки assets или binary content в Yjs.
- Загружать и временно сохранять полный Yjs state через существующие `GET`/`PUT /api/v1/pages/{pageId}/document`, не создавая block CRUD или authoritative TipTap JSON.
- Выполнять autosave с debounce 750 мс, последовательными PUT, сохранением последнего dirty snapshot, доступными статусами и retry.
- Заменить заглушку активной страницы в workspace редактором, сохранив breadcrumbs и heading.
- Оставить Hocuspocus transport, realtime collaboration, presence и вывод `canEdit` из effective permissions в issue #46; при их внедрении временный REST lifecycle должен быть удалён.

## Capabilities

### New Capabilities

- `web-page-editor`: Наблюдаемое поведение автономного TipTap/Yjs-редактора страницы, URL-only media и временного REST autosave.

### Modified Capabilities

- `web-page-workspace`: Активная страница вместо заглушки загружает и показывает редактор своего PageDocument.

## Impact

- Frontend: новый `widgets/page-editor`, интеграция в page composition workspace и публичные экспорты существующего generated document API.
- Dependencies: TipTap 3 extensions, Yjs и локальный набор Lucide icons добавляются только в `@lite-notion/web`; существующие Hugeicons и shadcn configuration сохраняются.
- Backend/API: endpoints, DTO, database schema и generated API не меняются; web использует существующий full-state document contract.
- Infrastructure: изменений нет; WebSocket URL и collaboration service остаются вне scope.
- Ограничение этапа: несколько вкладок не поддерживают сходимость и используют last-write-wins до замены REST bridge в issue #46.
