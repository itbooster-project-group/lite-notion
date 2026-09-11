## Context

См. `proposal.md` для мотивации. На текущем web frontend `PrivateWorkspace` и `WorkspacePage` используют `useGetPageTree()` и `useListProjects()`, а `WorkspaceTree`/`PageTree` ориентированы на mutable owned pages. Generated client уже содержит `useGetSharedPages` и `getGetSharedPagesQueryKey`, но hook не экспортирован через `shared/api/index.ts`; generated MSW handler существует, однако не зарегистрирован в общих handlers.

`PageTreeNodeDto` уже возвращает effective `accessRole`. Collaborative session и `PageEditorSurface` уже поддерживают `editable`, поэтому backend permission logic и editor surface расширять не требуется.

## Goals / Non-Goals

**Goals:**

- Добавить независимый shared page source и navigation section.
- Разрешить direct page routes для shared pages без owned `ProjectDto`.
- Передавать backend-provided role в collaborative session.
- Изолировать shared query loading/error от owned workspace.
- Сохранить FSD boundaries и existing owned mutations.

**Non-Goals:**

- Backend/API/database changes.
- Управление grants, ролями или `inherit/restricted`.
- Client-side calculation of inheritance/effective permissions.
- Shared project metadata, invitations, public pages или realtime awareness.

## Decisions

### 1. Два независимых page data sources

Owned и shared response остаются двумя независимыми data sources. В model entities/page появятся pure selectors для поиска page route context и ancestor chain. Context будет содержать `source: 'owned' | 'shared'` и выбранный node. Нормализация в indexes не является обязательной: если текущего backend tree shape достаточно, selectors используют traversal.

Если backend неожиданно вернёт один page id в обоих sources, resolver defensively выбирает owned page. Отдельная архитектура или специальный UI flow для такой коллизии не вводится.

Единый merged tree отклонён: он нарушает требование раздельных источников и усложняет permissions boundary. При этом не создаётся обязательный generic normalization layer.

### 2. Отдельный read-only shared tree

В `widgets/workspace-navigation` будет отдельный `SharedPagesTree`, который получает shared page data и page navigation callback. Отдельные `SharedPagesTree` model/item слои добавляются только если фактическая реализация компонента этого требует. Компонент не будет использовать mutable `WorkspaceTreeItem` или `PageTree`, потому что они автоматически предполагают create/move/rename/delete handlers.

Рассматривалось расширение `WorkspaceTreeItem` флагом permissions, но оно смешало бы две разные capability-модели и создало риск выдачи owner controls shared пользователю.

### 3. Route resolution без project membership для shared pages

Для page route page selection будет выполняться по обоим tree sources. Проверка `ProjectDto` останется обязательной для project route и применяться к owned page context, но не будет gate для shared page. Shared breadcrumbs строятся из shared ancestors; project name и owner name не придумываются, так как endpoint их не предоставляет.

`PrivateWorkspace` и `WorkspacePage` используют один и тот же pure resolution contract, но не принимают независимо конфликтующие route-state решения. У `useGetSharedPages` должен быть один понятный composition owner: он либо передаёт вниз data/status/retry, либо нижележащая composition использует тот же React Query cache. Это сохраняет текущий shell/content split без двух orchestration layers для одного query.

Для direct page route применяется последовательный resolver: сначала дождаться owned tree; если page найдена в owned tree, сразу открыть owned page независимо от shared loading/error; если page не найдена, учитывать shared query. В этом случае shared loading даёт pending state, shared error — page-level error/retry, а shared success с отсутствующей page — `WorkspaceUnavailable`. Общий `ownedLoading || sharedLoading` для уже найденной owned page не используется.

### 4. Role mapping только в page composition

Page composition преобразует backend enum в editor capability: `viewer` → `false`, `editor`/`owner` → `true`. Это не вычисление effective permission. `CollaborativePageEditor` передаст значение в существующий `createCollaborativePageDocumentSession` и включит в effect dependencies `pageId` и вычисленный `editable`, а не raw `accessRole`. Поэтому переход `editor` → `owner` при `editable=true` не требует обязательного recreate.

Редактор и TipTap surface не получают новых permission rules: они продолжают реагировать на `session.editable`.

### 5. Independent shared query states

Workspace shell будет загружать shared query вместе с owned data, но shared error/loading/empty UI будет локализован в `Доступные мне`. Ошибка owned projects/page tree сохраняет существующее блокирующее состояние. Retry shared query использует его generated query API и не подменяет owned cache.

Generated client и generated MSW output не редактируются вручную. Public re-export в `shared/api/index.ts` и регистрация уже сгенерированного handler в `mocks/handlers.ts` остаются допустимыми integration changes. Default MSW handler для `/pages/shared` возвращает `[]`, чтобы не менять существующие owned workspace tests; success/error/hierarchy задаются test overrides.

## Risks / Trade-offs

- [Risk] Backend неожиданно вернёт один page id в обоих ответах → простой defensive owned-first resolver; отдельная collision architecture не нужна.
- [Risk] Shared page имеет project id, отсутствующий у пользователя → route resolver не обращается к project membership для `source=shared`.
- [Risk] Ошибка shared query может скрыть рабочий owned workspace → независимые query states и локальный retry.
- [Risk] Изменение роли оставит старую editable session → lifecycle зависит от `pageId` и `editable`; смена `editor` на `owner` при том же `editable=true` не вызывает обязательного recreate.
- [Risk] Shared tree случайно получит mutation UI → отдельный read-only component без mutation props и без переиспользования mutable item.
- [Risk] Shared hierarchy не содержит ancestor из-за backend response shape → показывать ровно доступную hierarchy и не синтезировать metadata, которой нет в API.

## Migration Plan

Изменение frontend-only и не требует миграций или rollout steps на backend. После реализации:

1. обновить/проверить MSW fixtures;
2. прогнать web unit tests, typecheck, lint и build;
3. прогнать root checks согласно repository guidelines.

Rollback выполняется удалением shared query/navigation composition и role prop changes; backend contract не меняется.

## Open Questions

Нет. Спецификация фиксирует source precedence, route behavior и read-only component boundary до начала реализации.
