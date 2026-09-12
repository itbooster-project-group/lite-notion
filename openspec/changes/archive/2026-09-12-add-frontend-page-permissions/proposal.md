## Why

Frontend уже получает от API эффективную роль страницы, но не использует её как единый контракт для редактирования и управления доступом. Поэтому viewer может видеть mutation controls, а owner не имеет штатного UI для direct grants и режима наследования.

## What Changes

- Ввести гранулярную capability-модель поверх `PageDto.accessRole` без самостоятельного вычисления inheritance: `canEditContent`, `canCreateChild`, `canRenamePage`, `canMovePage`, `canDeletePage`, `canManageAccess`.
- Передать capabilities через page/workspace composition в editor, page tree и mutation controls; для tree actions использовать роль конкретного target node.
- Оставить collaborative document доступным viewer, но сделать editor surface и все mutation controls readonly/недоступными по роли.
- Добавить FSD feature `features/page-access` для owner-only списка direct grants, grant/update/revoke и переключения `inherit`/`restricted`.
- Строить новый и изменяемый permission UI на существующих обёртках `src/shared/ui`.
- Переиспользовать существующие generated permissions и access-mode hooks, добавив только недостающие public exports из `shared/api`.
- После mutations инвалидировать только необходимые queries: permissions для grants, active page и релевантные page/tree queries для access-mode.
- Добавить regression и integration tests для owner/editor/viewer и loading/error/empty mutation states.

Явно вне scope: backend, generated API/OpenAPI-файлы, server/WebSocket authorization, самостоятельное вычисление inheritance, отображение источника inherited permission, unrelated navigation/editor redesign и новые API endpoints.

## Capabilities

### New Capabilities

- `page-access`: owner-only управление direct page grants и режимом наследования в frontend.

### Modified Capabilities

- `web-page-editor-collaboration`: effective `accessRole` управляет editable/read-only editor behavior без изменения collaboration authorization.
- `web-page-workspace`: capabilities ограничивают page actions и показывают page-access UI только owner.

## Impact

- Frontend: `entities/page/model/page-capabilities.ts` и public export `entities/page` для capability contract; `features/page-access` только для grants/access-mode UI и orchestration; `pages/workspace`, `features/page-editing`, `features/workspace-management`, `widgets/page-editor`, `widgets/workspace-navigation` для применения capabilities.
- API consumption: переиспользуются `useGetPagePermissions`, `useGrantPagePermission`, `useRevokePagePermission`, `useSetPageAccessMode`; public barrel exports будут дополнены без редактирования generated source.
- Tests: Vitest/RTL unit, component and workspace integration tests; `steiger`, lint, typecheck, web tests и build.
