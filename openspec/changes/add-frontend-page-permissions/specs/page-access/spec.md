## Purpose

Даёт владельцу страницы понятный frontend-инструмент для управления прямыми разрешениями и границей наследования, сохраняя effective access role исключительно контрактом backend.

## ADDED Requirements

### Requirement: Централизованные capabilities страницы

Frontend MUST преобразовывать `PageDto.accessRole` в единый domain capability contract с capabilities `canEditContent`, `canCreateChild`, `canRenamePage`, `canMovePage`, `canDeletePage` и `canManageAccess`. `canManagePage`, если предоставляется, MUST быть только derived helper и MUST NOT использоваться для gating конкретных actions. Ни один экран MUST NOT вычислять inheritance, источник разрешения или effective role из direct grants.

Матрица capabilities MUST соответствовать текущим backend permissions: owner — все capabilities; editor — `canEditContent`, `canCreateChild` для child page и `canRenamePage`; viewer — ни одной; `canMovePage`, `canDeletePage` и `canManageAccess` — только owner.

#### Scenario: Owner capabilities
- **WHEN** API возвращает странице `accessRole=owner`
- **THEN** frontend включает все перечисленные capabilities

#### Scenario: Editor capabilities
- **WHEN** API возвращает странице `accessRole=editor`
- **THEN** frontend включает `canEditContent`, `canCreateChild` для child page и `canRenamePage`
- **AND** frontend отключает `canMovePage` и `canDeletePage`
- **AND** frontend скрывает управление direct grants и access mode

#### Scenario: Viewer capabilities
- **WHEN** API возвращает странице `accessRole=viewer`
- **THEN** frontend отключает редактирование содержимого и page mutations
- **AND** collaborative document всё равно загружается

### Requirement: Owner manages direct grants

Frontend MUST предоставлять только owner страницы список direct grants с email, именем и ролью `viewer`/`editor`, а также действия grant по email, изменения роли и revoke. Direct grants MUST отображаться отдельно от `accessRole`; frontend MUST NOT утверждать, что grant является источником effective access.

#### Scenario: Owner views grants
- **WHEN** owner открывает управление доступом доступной страницы
- **THEN** frontend загружает и показывает direct grants с loading, empty и recoverable error states

#### Scenario: Owner grants or changes a role
- **WHEN** owner отправляет зарегистрированный email с ролью `viewer` или `editor`
- **THEN** frontend вызывает generated grant mutation и обновляет список grants после успеха
- **AND** повторная выдача роли не создаёт дубликат в UI

#### Scenario: Owner revokes a grant
- **WHEN** owner подтверждает revoke конкретного direct grant
- **THEN** frontend вызывает generated revoke mutation и убирает grant после успеха

#### Scenario: Non-owner cannot manage grants
- **WHEN** editor или viewer открывает страницу
- **THEN** frontend не показывает controls page-access и не вызывает permissions mutation

### Requirement: Owner controls access mode

Frontend MUST позволять owner переключать `accessMode` между `inherit` и `restricted` через существующий generated access-mode mutation. UI MUST объяснять только эффект режима, не вычисляя результирующие роли или источник наследования.

#### Scenario: Warn before changing access mode
- **WHEN** owner выбирает новое значение `restricted` или `inherit`
- **THEN** frontend показывает понятное предупреждение о возможном влиянии на доступ к странице и её поддереву
- **AND** предупреждение не перечисляет вычисленные роли пользователей

#### Scenario: Change access mode after confirmation
- **WHEN** owner подтверждает выбор `restricted` или `inherit`
- **THEN** frontend вызывает access-mode PUT с выбранным значением
- **AND** после успеха инвалидирует active page и только релевантные page/tree queries

#### Scenario: Access mode mutation fails
- **WHEN** API отклоняет изменение режима
- **THEN** frontend показывает recoverable error, сохраняет последнее подтверждённое значение и позволяет повторить

### Requirement: Permission mutations expose safe async states

Page-access UI MUST предотвращать duplicate submit во время pending, показывать доступный pending state, сохранять форму/список при ошибке и не выводить сырые backend details. После grant/update/revoke MUST инвалидироваться permissions query active page. После access-mode mutation MUST инвалидироваться active page и только релевантные page/tree queries. Глобальная invalidation всех workspace queries MUST NOT выполняться без требования текущего query graph.

#### Scenario: Grant request is pending
- **WHEN** grant request ещё не завершён
- **THEN** submit control disabled и показывает pending state
- **AND** повторный grant не отправляется

#### Scenario: Permissions query fails
- **WHEN** direct grants query завершается recoverable error
- **THEN** page остаётся доступной, показывается безопасная ошибка и retry повторяет только permissions query
