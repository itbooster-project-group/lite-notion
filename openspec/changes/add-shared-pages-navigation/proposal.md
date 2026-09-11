## Why

Пользователь может получить доступ к чужой странице через backend permission model, но web workspace загружает и маршрутизирует только owned pages. Поэтому shared page не открывается по прямой ссылке, а интерфейс не показывает доступные страницы и не применяет effective `accessRole` к редактору.

## What Changes

- Подключить `GET /pages/shared` через публичный `shared/api` API.
- Хранить owned и shared data sources раздельно; использовать pure selectors для route context и ancestor chain, а normalization indexes — только если они упрощают реализацию.
- Добавить отдельную navigation-only секцию `Доступные мне` с hierarchy и независимыми loading/empty/error состояниями.
- Разрешить page routes для shared pages без требования, чтобы их `projectId` присутствовал среди owned projects.
- Передавать backend-provided `accessRole` в collaborative editor: `viewer` получает read-only editor, `editor` и `owner` — editable editor.
- Пересоздавать collaborative session при смене page или вычисленного `editable`; изменение `editor` на `owner` при неизменном `editable=true` не требует recreate.
- Явно обработать loading/error/not-found состояния direct shared page route.
- Для owned page route использовать short-circuit: после успешного owned lookup shared query не блокирует страницу и влияет только на `Доступные мне`.
- Иметь одного composition owner для `useGetSharedPages`, передавая ниже его data/status/retry или используя общий React Query cache без дублирования route-state решений.
- Покрыть shared navigation, routing, role-based editor и регрессии owned workspace тестами.
- Не изменять backend, permission algorithm, API contract или scope управления grants/access mode.

## Capabilities

### New Capabilities

Нет. Поведение расширяет существующие web workspace и collaborative editor capabilities.

### Modified Capabilities

- `web-page-workspace`: добавить shared pages navigation, раздельные owned/shared data sources и direct routing shared pages.
- `web-page-editor-collaboration`: применять backend `accessRole` к editable state collaborative editor и lifecycle session.

## Impact

- Frontend: `shared/api`, `entities/page`, workspace page/layout, workspace navigation и collaborative editor.
- Tests: Vitest/React Testing Library и существующие MSW handlers/fixtures для `/pages/shared`.
- Backend: изменений не требуется; используется существующий `GET /pages/shared` и `PageTreeNodeDto.accessRole`.
- Dependencies: новые зависимости не требуются; generated client уже содержит нужный endpoint и query key.
