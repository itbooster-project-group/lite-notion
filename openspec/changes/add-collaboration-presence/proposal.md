## Why

Совместное редактирование уже синхронизирует содержимое страницы через Yjs и Hocuspocus, но пользователь не видит, кто ещё работает с документом и где находится его курсор. Issue #85 добавляет presence поверх существующей collaboration session, чтобы сделать совместную работу понятной без изменения источника истины и модели прав.

## What Changes

- Добавить presence current user через `provider.awareness` существующего Hocuspocus provider.
- Показать remote carets, selection, имя и стабильный цвет пользователя через официальный TipTap CollaborationCaret.
- Добавить компактный список активных участников рядом со статусом collaboration/editor.
- Дедуплицировать participants по `Awareness state.user.id`, сохраняя отдельные client awareness states для курсоров.
- Расширить узкий transport/session contract только необходимыми provider/Awareness возможностями и включить presence в lifecycle session.
- Поддержать viewer и editor одинаково для presence; `editable` влияет только на возможность изменения документа.
- Добавить unit, component/integration и Playwright regression tests для presence, reconnect, cleanup и page switch.

## Capabilities

### New Capabilities

- `collaboration-presence`: визуальное presence-состояние документа, remote cursors/selections и participants UI.

### Modified Capabilities

<!-- Existing document collaboration behavior remains compatible; the new presence contract is isolated in the new capability. -->

## Impact

- Frontend: `shared/collaboration` transport adapter, `features/page-editing` collaborative session/model, `entities/page-document` editor extensions, workspace/editor composition and local CSS/UI.
- Dependencies: добавить официальный `@tiptap/extension-collaboration-caret` в web app, если он отсутствует в manifest/lockfile.
- Backend/API/infrastructure: без новых endpoints, events, database tables или Prisma entities; Awareness передаётся только текущим Hocuspocus runtime и не сохраняется в PostgreSQL.
- Authorization: не изменяется; доступ к документу и read/write capability остаются ответственностью существующей API/collaboration permission logic.
