## Context

См. `proposal.md` и delta specs. В `main` workspace уже передаёт канонический page id в `WorkspaceMain`, а generated client содержит операции чтения и полной замены PageDocument. Исходная ветка `feature/tiptap-editor` содержит протестированные schema/UI/media части, но основана на старом home route, включает неиспользуемые realtime dependencies и ещё не имеет persistence lifecycle.

Issues #44 и #45 не завершены, поэтому effective permissions и Hocuspocus room пока недоступны. Backend document API проверяет owner access и хранит opaque Yjs state, но не предоставляет optimistic revision для разрешения конфликтов нескольких клиентов.

## Goals / Non-Goals

**Goals:**

- Выборочно перенести editor core на актуальный workspace, сохранив Y.Doc единственным редактируемым state.
- Изолировать временный REST lifecycle так, чтобы issue #46 могла заменить его Hocuspocus room без изменения schema и editor UI.
- Не терять более новое локальное изменение из-за debounce или завершившегося позднее PUT того же клиента.
- Сохранить доступность keyboard, focus, status и error flows.

**Non-Goals:**

- Сходимость нескольких вкладок, conflict detection или merge полных REST snapshots.
- WebSocket transport, awareness, presence, reconnect и server read-only.
- Новые backend endpoints, DTO, migrations или изменения OpenAPI.
- File upload, private assets и durable offline queue.

## Decisions

### 1. Перенести только editor core на новую ветку от main

Новая ветка `web/tiptap-editor-core` создаётся от актуального `origin/main`. Из commit `c9917b6` переносятся только widget source и tests; устаревший home demo, manifests, lockfile и старый collaborative OpenSpec не переносятся. Dependencies добавляются заново через pnpm поверх текущего manifest.

Альтернатива — rebase или merge всей ветки — отклонена: она сохраняет неверную route integration, удаляет используемые Hugeicons и смешивает готовый core с заблокированными realtime tasks.

### 2. Widget разделяет transport container и чистую surface

Публичный `PageEditor` принимает `pageId` и явный `canEdit`. Он владеет lifecycle Y.Doc, загрузкой, autosave и status UI. `PageEditorSurface` принимает готовый Y.Doc и presentation-флаг, создаёт TipTap instance и не знает об API, page routing или auth.

`WorkspaceMain` рендерит `PageEditor` только для найденной активной страницы и передаёт `canEdit={true}`, потому что текущие tree/document endpoints доступны только владельцу. Generic `canEdit={false}` сохраняется и тестируется как UI seam, но не считается authorization boundary.

Альтернатива — хранить transport в page slice — отклонена: при переходе на Hocuspocus это потребовало бы менять workspace composition вместо внутреннего container widget.

### 3. Schema version 1 остаётся единой

Единая factory включает paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold/italic/strike/code/link и URL-only image/YouTube/direct-video. Collaboration extension подключает TipTap к переданному Y.Doc и владеет history; StarterKit undo/redo отключается.

Link разрешает HTTP, HTTPS и mailto с нормализацией отсутствующей scheme в HTTPS. Media принимает только HTTPS; direct video ограничен MP4/WebM path. Attributes media хранятся только через ProseMirror transactions.

### 4. Document API используется напрямую без Query cache

Shared API публично экспортирует уже generated `getPageDocument`, `updatePageDocument`, `PageDocumentDto` и `UpdatePageDocumentDto`. Container вызывает функции напрямую: TanStack Query не хранит отдельную authoritative snapshot документа.

При смене `pageId` предыдущая загрузка инвалидируется через generation token/AbortController. Новый Y.Doc создаётся после успешного GET; непустой base64 state декодируется и применяется до регистрации update listener. Empty state оставляет новый document пустым. Несовпадение `tiptapSchemaVersion` или ошибка decode переводит container в блокирующее безопасное состояние без PUT.

Browser base64 helpers обрабатывают Uint8Array chunk-ами, чтобы полный state до API limit не зависел от размера argument stack.

### 5. Autosave использует single-flight очередь последнего snapshot

Update Y.Doc отмечает document dirty и перезапускает таймер 750 мс. По таймеру полный `Y.encodeStateAsUpdate` кодируется и передаётся в один PUT. Пока PUT выполняется, новые updates только заменяют queued snapshot; после завершения запросов отправляется последний queued state.

Успех переводит документ в `saved` только если после отправленного snapshot не было новых updates. Ошибка сохраняет последний snapshot и состояние `save-error`; retry отправляет актуальный state. Ошибка не уничтожает Y.Doc и не показывает backend body.

При смене страницы или unmount container запускает немедленный финальный PUT и не abort-ит его. `beforeunload` устанавливается только для dirty, saving или save-error state. Гарантия durable save при аварийном закрытии browser не заявляется.

### 6. Status UI является частью доступного контракта

До GET editor surface не рендерится. Loading получает `aria-busy`; saving/saved объявляются polite live region; load/save errors получают безопасный alert и retry. Unsupported schema и decode error используют отдельное блокирующее сообщение, чтобы неизвестный state нельзя было случайно заменить пустым.

### 7. Main icon system сохраняется

Hugeicons и `components.json` из main не меняются. `lucide-react` остаётся локальной dependency editor command maps, что минимизирует риск переноса уже написанных controls без миграции иконок всего приложения. Hocuspocus provider, provider-react и collaboration-caret не добавляются до issue #46.

### 8. Media dialog не конкурирует за focus с ProseMirror

При выборе media slash command query удаляется transaction без отложенного `editor.focus()`, затем форма открывается и синхронно получает focus через ref effect. Возврат focus в editor выполняется только при закрытии формы. Это устраняет воспроизводимую full-suite гонку исходной ветки.

## Risks / Trade-offs

- [Две вкладки перезапишут snapshots last-write-wins] → явно исключить concurrent editing и заменить REST bridge в issue #46.
- [Page switch произойдёт до завершения финального PUT] → запускать request без abort, показывать dirty status и предупреждать browser unload; не обещать offline durability.
- [Поздний GET или PUT старой страницы изменит новую] → изолировать lifecycle по generation/pageId и не применять responses к новому Y.Doc.
- [Большой state создаст лишние allocations] → использовать chunked base64 conversion и существующий 1 MiB API limit.
- [External media URL недоступен или небезопасен] → валидировать HTTPS до transaction, сохранять node и показывать fallback при load failure.
- [Presentation read-only ошибочно примут за security] → owner-only integration передаёт true, а effective roles и server enforcement остаются явными tasks issue #46.
- [Две icon libraries увеличивают bundle] → импортировать Lucide icons по именам только внутри editor; не менять application-wide icon convention в этом change.

## Migration Plan

1. Создать и получить human review change artifacts.
2. Добавить только используемые TipTap/Yjs/Lucide dependencies и перенести чистую schema/UI часть.
3. Добавить REST container, status states и workspace integration; проверить полный suite и dependency graph.
4. После реализации оставить change активным до CI и human review; затем синхронизировать specs и архивировать в том же PR.
5. В issue #46 заменить REST container Hocuspocus room, удалить document GET/PUT из production editor lifecycle и сохранить `PageEditorSurface`/schema.

Rollback до production realtime выполняется удалением `PageEditor` из `WorkspaceMain` и возвратом placeholder; backend state и schema не мигрируются.
