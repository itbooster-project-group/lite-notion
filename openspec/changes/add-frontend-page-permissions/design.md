## Context

Текущий frontend передаёт `accessRole` в collaborative editor, но отдельной capability-модели нет. Page tree и editor actions принимают callbacks без role context. Generated client уже содержит GET/PUT/DELETE permissions и PUT access-mode, но `apps/web/src/shared/api/index.ts` экспортирует не все эти symbols. Backend contracts возвращают `PageDto.accessRole` и `PagePermissionDto` для direct grants; backend permissions algorithm и OpenAPI остаются источником истины.

## Goals / Non-Goals

**Goals:**

- Единый granular role-to-capability mapping и единый поток capabilities от конкретного page/tree node до UI/features.
- Полный readonly UX для viewer при сохранении collaborative document loading.
- Owner-only `features/page-access` с query/mutations, async states и query invalidation.
- Соблюдение FSD public APIs и тестируемость поведения owner/editor/viewer.

**Non-Goals:**

- Backend/API/generated changes, server authorization или вычисление inheritance на frontend.
- Отображение inherited source, приглашения незарегистрированных пользователей или transfer ownership.
- Переписывание текущего navigation/editor interaction pattern за пределами permission gating.

## Decisions

1. **Capability model в `entities/page/model/page-capabilities.ts` с public export.**
   `getPageCapabilities(accessRole)` возвращает granular contract: `canEditContent`, `canCreateChild`, `canRenamePage`, `canMovePage`, `canDeletePage`, `canManageAccess`; `canManagePage` допускается только как derived helper и не используется для gating отдельных actions. Компоненты не сравнивают role напрямую в JSX. Domain placement выбран потому, что contract используется несколькими features/widgets; `features/page-access` не импортирует sibling features и отвечает только за grants/access-mode UI.

   Matrix по текущим backend use cases:

   | Capability | owner | editor | viewer |
   | --- | --- | --- | --- |
   | `canEditContent` | yes | yes | no |
   | `canCreateChild` | yes | yes, только child page под доступным editable parent | no |
   | `canRenamePage` | yes | yes | no |
   | `canMovePage` | yes | no | no |
   | `canDeletePage` | yes | no | no |
   | `canManageAccess` | yes | no | no |

   Создание root page требует ownership проекта и не выводится из `canCreateChild` активной страницы.

2. **Capabilities передаются параметрами вниз через page composition, но считаются для target node.**
   `WorkspacePage`/`WorkspaceMain` получают role active page для editor/page-access и передают `getPageCapabilities(node.accessRole)` в page tree/navigation для каждой конкретной action target. Нельзя использовать capabilities active page для произвольного tree node. `PageTreeNodeDto` уже содержит `accessRole` на каждом узле, включая nested nodes и shared tree, поэтому API/contract gap для этого требования отсутствует; inheritance frontend не вычисляет. Shared route state остаётся общим context composition; page-access query enabled только для active page с `canManageAccess`.

3. **Editor surface gates all content mutations at its boundary.**
   `editable=false` передаётся в TipTap and collaborative session; toolbar, bubble/slash menu, link/media dialogs and block reorder are not mounted. Page action widgets получают capabilities and hide/disable create, rename, move, delete and drag controls individually according to backend-supported role semantics. Эта граница предпочтительнее попытки обезвредить отдельные command handlers.

4. **`features/page-access` owns direct grants UI and mutation orchestration.**
   Feature использует public generated API exports, `useQueryClient` и generated query keys. После grant/update/revoke инвалидируется permissions query; page/access-mode changes инвалидируют active page and relevant page tree queries, без ручного fetch и без редактирования generated files.

5. **Direct grants remain presentation data, not permission state.**
   Grant list показывает только поля `PagePermissionDto`; effective role берётся только из `PageDto.accessRole`. Access mode control показывает серверное `PageDto.accessMode`, а optimistic updates ограничены локальным pending state либо подтверждённым response.

6. **API mismatch is limited to the web barrel.**
   Existing generated hooks: `useGetPagePermissions`, `useGrantPagePermission`, `useRevokePagePermission`, `useSetPageAccessMode`; existing query keys/options are reused. Add missing exports from `apps/web/src/shared/api/index.ts`; do not regenerate or modify generated source unless verification shows the committed snapshot lacks a required hook.

7. **UI uses shared primitives.**
   `features/page-access` и permission-gated controls MUST использовать существующие компоненты и wrappers из `apps/web/src/shared/ui` (`Button`, `Input`, `Select`, `Dialog`, `Text`, `Heading` и доступные form primitives). Прямые импорты generated shadcn primitives в feature/page/workspace code не добавляются; новый shared primitive создаётся только если существующего контракта действительно недостаточно.

8. **Invalidation follows the current query graph.**
   Grant/update/revoke инвалидируют только permissions query active page. Access-mode mutation инвалидирует active page query/cache и только релевантные page/tree queries, которые показывают `accessMode`/effective accessible tree; shared query инвалидируется только если текущая shared tree действительно содержит изменённую страницу. Никакой глобальной invalidation всех workspace queries после каждой mutation не планируется.

9. **Access-mode changes require an explicit warning.**
   Перед отправкой `inherit`/`restricted` UI показывает понятное предупреждение, что смена режима может изменить доступ к текущей странице и её поддереву. Предупреждение не перечисляет конкретные результирующие роли: frontend не вычисляет permission inheritance.

## Risks / Trade-offs

- [Risk] Некоторые текущие page mutations backend разрешает только owner (например, move/delete), хотя editor может редактировать document и создавать child/переименовывать → granular capability matrix фиксируется по фактическим API use cases и тестируется отдельно.
- [Risk] Tree widget использует headless-tree и имеет собственную keyboard/drag behavior → gating должно отключать feature flags/callbacks, а не только визуально скрывать кнопку.
- [Risk] Permissions query может завершиться ошибкой после доступного page route → feature показывает локальную recoverable error, не превращая страницу в unavailable.
- [Risk] Query invalidation может кратковременно показывать stale metadata → mutation UI использует pending state и refetch/invalidation generated keys перед отображением окончательного значения.

## Migration Plan

1. Добавить capability contract и public API exports.
2. Интегрировать capabilities в editor и existing page action composition.
3. Реализовать page-access feature и подключить его owner-only к active page.
4. Добавить regression/integration tests, затем пройти `steiger`, lint, typecheck, web tests и build.

Rollback — удалить feature wiring и capability gates; backend contract и stored permission data не изменяются.
