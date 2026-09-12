## 1. Shared data and public API

- [x] 1.1 Экспортировать `useGetSharedPages` и `getGetSharedPagesQueryKey` через публичный `apps/web/src/shared/api/index.ts` без изменения generated client.
- [x] 1.2 Зарегистрировать существующий generated MSW handler для `/pages/shared` с deterministic default response `[]`; success/error/shared hierarchy задавать test overrides.
- [x] 1.3 Добавить в `entities/page` pure selectors для независимых owned/shared sources, page source context и ancestor chain; использовать indexes только если они упрощают реализацию, иначе traversal.
- [x] 1.4 Покрыть selectors тестами на независимость sources и shared page без owned project; collision не выделять в отдельную архитектуру или обязательный acceptance flow.

## 2. Shared navigation

- [x] 2.1 Добавить отдельный read-only `SharedPagesTree` в `widgets/workspace-navigation`, не используя mutable `WorkspaceTreeItem` или `PageTree`; отдельные model/item files создавать только при фактической необходимости.
- [x] 2.2 Реализовать секцию `Доступные мне` с hierarchy, раскрытием, keyboard-accessible navigation и переходом на `/pages/{pageId}`.
- [x] 2.3 Добавить локальные loading, empty и safe error/retry states для shared navigation, сохраняя owned navigation при ошибке shared query.
- [x] 2.4 Покрыть shared tree тестами hierarchy, empty/error/retry и отсутствия create/move/rename/delete controls.

## 3. Workspace route composition

- [x] 3.1 Назначить одного composition owner для `useGetSharedPages` и передавать вниз data/status/retry либо использовать тот же React Query cache без второго route-state orchestration layer.
- [x] 3.2 Реализовать route resolution в порядке: дождаться owned tree; при найденной owned page resolve сразу; при отсутствии owned page учитывать shared query; shared loading — pending, shared error — page-level retry, shared success без page — `WorkspaceUnavailable`.
- [x] 3.3 Разрешить page routes через owned/shared page context и использовать breadcrumbs `Доступные мне / <shared ancestors> / <page>`; не требовать matching `ProjectDto` для shared page.
- [x] 3.4 Сохранить существующее поведение root/project routes, owned page mutations, project membership checks и delete cleanup.
- [x] 3.5 Передавать resolved page context из workspace composition в `WorkspaceMain` без переноса permission business logic в `WorkspacePage`.
- [x] 3.6 Добавить workspace integration tests для owned page при shared loading/error, direct shared navigation, отсутствующего shared project, route loading/error/not-found states, shared query isolation/retry и project-route regressions.

## 4. Role-based collaborative editor

- [x] 4.1 Передавать backend `accessRole` выбранной страницы в `CollaborativePageEditor` и вычислять только `viewer -> editable=false`, `editor/owner -> editable=true`.
- [x] 4.2 Передавать `editable` в `createCollaborativePageDocumentSession`; lifecycle должен зависеть от `pageId` и `editable`, а не от raw `accessRole`, и корректно уничтожать stale session.
- [x] 4.3 Добавить editor composition tests для viewer, editor, owner, смены page и смены editable capability; зафиксировать, что `editor -> owner` при `editable=true` не требует обязательного recreate.
- [x] 4.4 Проверить, что shared viewer/editor не инициируют owner-only permissions API и не получают owner-only controls.

## 5. Verification and documentation

- [x] 5.1 Обновить/добавить FSD boundary tests, если новые selectors/navigation imports затрагивают существующие boundaries.
- [x] 5.2 Запустить web tests, typecheck, lint и build; затем root `pnpm test` и остальные обязательные проверки.
- [x] 5.3 Проверить, что backend, REST document fallback, permission management scope и generated outputs не изменялись.
