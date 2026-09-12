## 1. Capability model

- [x] 1.1 Добавить `entities/page/model/page-capabilities.ts` и public FSD export с granular mapping для `owner | editor | viewer`: `canEditContent`, `canCreateChild`, `canRenamePage`, `canMovePage`, `canDeletePage`, `canManageAccess`; оставить `canManagePage` только как derived helper.
- [x] 1.2 Сверить и покрыть matrix фактических backend permissions: owner — все capabilities; editor — content/create-child/rename; viewer — none; move/delete/access — owner-only.
- [x] 1.3 Добавить public re-exports существующих permissions/access-mode generated hooks, DTO и query keys из `shared/api` без изменения generated files.

## 2. Page and editor integration

- [x] 2.1 Передавать capabilities active page в editor/page-access, а для каждого page tree/navigation node вычислять capabilities из его собственного `accessRole`; не использовать active page role для чужих targets и не вычислять inheritance.
- [x] 2.2 Обеспечить collaborative session loading для viewer с `editable=false`; скрыть/disable toolbar, bubble/slash/media, block reorder и content mutation paths.
- [x] 2.3 Ограничить page tree actions и drag/rename/create/move/delete controls согласно granular capability matrix конкретного node; root-page creation отдельно связать с project ownership; не менять backend mutation behavior.

## 3. Page access feature

- [x] 3.1 Создать `features/page-access` model/query composition для owner-only active page, loading/error/empty states и безопасных сообщений.
- [x] 3.2 Реализовать direct grants list, grant по email, role viewer/editor, повторную выдачу роли, role update и revoke через generated hooks и существующие компоненты `shared/ui`.
- [x] 3.3 Реализовать `inherit`/`restricted` control через generated access-mode mutation с pending/error handling и понятным подтверждением возможного влияния на страницу/поддерево без вычисления ролей.
- [x] 3.4 Настроить точечную invalidation: grants → только permissions query; access-mode → обновить active page через `setQueryData` и инвалидировать релевантный page tree query; исключить глобальную invalidation и ручные fetch.
- [x] 3.5 Проверить, что новый page-access UI и изменённые permission controls не импортируют generated shadcn primitives напрямую и используют public `shared/ui` API.

## 4. Tests

- [x] 4.1 Добавить unit tests capability matrix и visibility/action permissions для owner, editor и viewer, включая проверку derived `canManagePage` без его использования для конкретных gates.
- [x] 4.2 Обновить editor tests для viewer readonly, collaborative loading и отсутствия mutation UI; проверить editor/owner editable behavior.
- [x] 4.3 Добавить page-tree/navigation regressions для target-node roles: viewer hidden actions, editor allowed create/rename, owner move/delete, active-page role не влияет на соседний node.
- [x] 4.4 Добавить page-access tests для grants, role update, revoke с confirmation, access mode warning, pending/error/empty и точечной query invalidation.
- [x] 4.5 Добавить workspace integration tests для shared/owned route context и отсутствия блокировки page-access/content owned-project query states.
- [x] 4.6 Добавить regression для открытия page-access panel из sidebar без navigation.

## 5. Verification

- [x] 5.1 Запустить `pnpm --filter @lite-notion/web typecheck` и `pnpm lint`.
- [x] 5.2 Запустить `pnpm steiger:web`, релевантные web tests и полный `pnpm --filter @lite-notion/web test`.
- [x] 5.3 Запустить web build и проверить, что backend, OpenAPI snapshot и generated API files не изменились.
