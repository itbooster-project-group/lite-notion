## ADDED Requirements

### Requirement: Owned and shared page data remain separate

Workspace MUST загрузить owned pages через существующий page-tree endpoint и shared pages через `GET /pages/shared`, используя public API `shared/api`. Эти ответы MUST храниться как два независимых data source; shared pages MUST NOT добавляться в owned tree или смешиваться с ним для navigation и route resolution. Pure selectors MUST уметь разрешать page context и ancestor chain; конкретный способ обхода или normalization indexes выбирается реализацией.

#### Scenario: Shared pages are available
- **WHEN** `GET /pages/shared` возвращает доступные страницы
- **THEN** workspace показывает их в отдельной секции `Доступные мне`
- **AND** owned projects и owned pages остаются в существующем дереве

#### Scenario: Shared list is empty
- **WHEN** `GET /pages/shared` возвращает пустой список
- **THEN** секция `Доступные мне` показывает доступное empty state
- **AND** owned workspace продолжает работать

### Requirement: Shared navigation is read-only

Секция `Доступные мне` MUST показывать hierarchy shared pages и поддерживать переход к `/pages/{pageId}`. Она MUST NOT показывать или вызывать owner-only операции создания, переименования, перемещения или удаления страниц/проектов и MUST NOT использовать фиктивные mutation handlers.

#### Scenario: User navigates shared hierarchy
- **WHEN** пользователь раскрывает shared page и выбирает вложенную страницу
- **THEN** navigation открывает существующий route `/pages/{pageId}`
- **AND** hierarchy сохраняет структуру, полученную от backend

#### Scenario: Shared navigation has no mutation controls
- **WHEN** shared page отображается в navigation
- **THEN** рядом с ней отсутствуют controls create, rename, move и delete
- **AND** shared tree не принимает owned mutation callbacks

### Requirement: Shared page routes resolve without owned project membership

Для `/pages/{pageId}` workspace MUST искать страницу в owned и shared trees и явно определять source `owned` или `shared`. Owned page MUST иметь приоритет при совпадении id. Shared page MUST открываться независимо от наличия её `projectId` среди `ProjectDto` текущего пользователя. Existing project routes MUST сохранять проверку owned project.

#### Scenario: Direct navigation to shared page
- **GIVEN** shared tree содержит страницу `page-42`
- **AND** список owned projects не содержит её `projectId`
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает страницу и её collaborative editor
- **AND** не показывает `WorkspaceUnavailable` только из-за отсутствующего owned project

#### Scenario: Owned page opens while shared query is loading
- **GIVEN** owned tree успешно содержит страницу `page-42`
- **AND** shared query ещё выполняется
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace сразу открывает owned page
- **AND** shared loading влияет только на секцию `Доступные мне`

#### Scenario: Owned page opens while shared query fails
- **GIVEN** owned tree успешно содержит страницу `page-42`
- **AND** `GET /pages/shared` отвечает ошибкой
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace открывает owned page
- **AND** ошибка отображается только в секции `Доступные мне`

### Requirement: Shared page route exposes explicit loading, error and not-found states

Для `/pages/{pageId}` workspace MUST сначала дождаться owned tree. Если page найдена в owned tree, она MUST быть разрешена сразу, а shared query MUST NOT блокировать route. Если page не найдена в owned tree, workspace MUST учитывать shared query: loading показывает pending state, error показывает page-level error state с retry, а successful shared query без page позволяет показать `WorkspaceUnavailable`. Общий route loading, основанный на `ownedLoading || sharedLoading`, MUST NOT блокировать уже найденную owned page.

#### Scenario: Shared query is still loading after owned lookup misses
- **GIVEN** page отсутствует в owned tree
- **AND** shared query ещё выполняется
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает loading state
- **AND** не показывает `WorkspaceUnavailable`

#### Scenario: Shared query fails for an unknown owned page
- **GIVEN** page отсутствует в owned tree
- **AND** `GET /pages/shared` завершился ошибкой
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает безопасный page-level error state
- **AND** предлагает повторить shared query

#### Scenario: Page is absent after required queries succeed
- **GIVEN** owned и shared queries успешно завершились
- **AND** page отсутствует в обоих sources
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает `WorkspaceUnavailable`

### Requirement: Shared data failures are isolated from owned workspace

Ошибка или загрузка shared query MUST показываться в пределах секции `Доступные мне` и по возможности не должна скрывать успешно загруженные owned projects и owned tree. Пользователь MUST получить retry для shared query; сырые backend details MUST NOT отображаться.

#### Scenario: Shared query fails
- **WHEN** `GET /pages/shared` отвечает ошибкой
- **THEN** owned projects и owned navigation остаются доступны, если их queries успешны
- **AND** секция показывает безопасное error state с действием повторить

#### Scenario: Shared query retries successfully
- **WHEN** пользователь запускает retry после ошибки shared query
- **AND** повторный запрос успешен
- **THEN** секция заменяет error state hierarchy shared pages

### Requirement: Shared breadcrumbs identify the shared source without foreign metadata

Для shared page breadcrumbs MUST использовать понятную synthetic source label `Доступные мне`, затем доступных shared ancestors и текущую page title. Breadcrumbs MUST NOT требовать или придумывать project name или owner metadata, которых нет в API.

#### Scenario: Shared page breadcrumbs are displayed
- **GIVEN** shared hierarchy содержит `Parent` и страницу `Child`
- **WHEN** пользователь открывает shared `Child`
- **THEN** breadcrumbs показывают `Доступные мне / Parent / Child`
- **AND** не показывают выдуманное имя проекта или владельца
