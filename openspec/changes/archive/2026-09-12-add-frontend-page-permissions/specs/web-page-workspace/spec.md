## ADDED Requirements

### Requirement: Page actions follow capabilities

Workspace page trees MUST receive the centralized page capabilities calculated from each target node's own `accessRole` and MUST expose only actions allowed for that target role. Active page capabilities MUST NOT gate actions for arbitrary neighboring nodes. Viewer MUST NOT receive create child, rename, move, delete or drag controls; editor MUST receive only mutations supported for editor role by the existing API; owner MUST receive the full existing page action set.

#### Scenario: Viewer navigates a page tree
- **WHEN** viewer opens a page in workspace navigation or the project tree
- **THEN** page mutation controls are hidden or disabled while navigation remains usable

#### Scenario: Editor navigates a page tree
- **WHEN** editor opens an editable page
- **THEN** content and allowed page actions are available
- **AND** permissions management remains hidden

#### Scenario: Target node role controls its actions
- **GIVEN** active page имеет роль `viewer`, а соседний target node имеет роль `owner`
- **WHEN** workspace показывает действия target node
- **THEN** target node получает owner actions независимо от роли active page

#### Scenario: Tree DTO provides target roles
- **WHEN** frontend получает page tree
- **THEN** каждый page node содержит backend-provided `accessRole`, включая nested nodes
- **AND** frontend не выводит target role из active page и не вычисляет inheritance

### Requirement: Shared page route remains independent of owned permissions UI

Shared page content and breadcrumbs MUST NOT be blocked by the owned projects query. Shared pages MUST use their backend-provided effective role for readonly/editor behavior, while owner-only page-access controls are not shown for shared routes unless the page role itself is `owner`.

#### Scenario: Owned projects query is pending or failed
- **WHEN** a shared page route is open and owned projects query is pending or failed
- **THEN** shared page content and breadcrumbs continue to render according to shared context
- **AND** no owned permissions metadata is used
