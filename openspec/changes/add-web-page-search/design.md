## Context

См. `proposal.md` и `specs/web-page-search/spec.md`. Исследование выполнено на локальной `main` (`3f50a2f`, merge PR #104); рабочая копия чистая.

- Search API: `apps/api/src/search/dto/search-query.dto.ts`, `apps/api/src/search/search.controller.ts`, `apps/api/src/search/search-read.service.ts`, `apps/api/openapi.json`. `GET /api/v1/search` принимает обязательный `query` до 200 символов и optional integer `limit` 1–50 (default 20); backend trim-ит query и возвращает `[]` для пустой строки. Минимальной длины нет. DTO ответа — `{ pageId, title, snippet: string | null }`.
- Orval уже создал `useSearchPages`, query key и query options в `apps/web/src/shared/api/generated/search/search.ts`; query function передаёт TanStack `signal` в `apiFetch`. `SearchPagesParams` и `SearchResultDto` находятся в generated model. `apps/web/src/shared/api/index.ts` пока не публикует эти exports. Сгенерированный MSW handler уже доступен в `search/search.msw.ts` и включён в `generated/index.msw.ts`.
- Частная рабочая область компонуется в `apps/web/src/app/layouts/private-workspace.tsx`; `PrivateShell` предоставляет header composition, а `AppShell` — постоянную sidebar и мобильный modal sidebar. Страницы открываются по `/pages/{pageId}` через `workspacePagePath` и `router.push`.
- Shared `Dialog`, `DialogContent`, `DialogTitle`, `Input`, `Button` экспортируются из `apps/web/src/shared/ui`. Base UI dialog уже управляет Escape, modal focus и возвратом фокуса; существующие тесты этих свойств есть в `shared/ui/overlays.spec.tsx` и workspace dialog tests.
- `workspace-page.tsx` разрешает маршрут из permission-filtered page tree/shared pages и показывает neutral unavailable/error state. `PrivateWorkspace` живёт в постоянном private layout, поэтому `useGetPageTree` и `useGetSharedPages` остаются активными observers при route changes и сохраняют старые результаты, пока выполняется refetch. Сейчас `WorkspacePage` может разрешить `/pages/{pageId}` по этому cached tree и передать страницу в `CollaborativePageEditor`; route-level `GET /pages/{pageId}` для текущей проверки доступа не используется.
- `SessionProvider.clearSession` сейчас удаляет только current-user и asset-read-url entries, а смена пользователя очищает только asset-read-url cache. Следовательно, search/query cache может пережить logout или переключение пользователя.

## Goals / Non-Goals

**Goals:**

- Добавить доступную поисковую палитру в существующую приватную рабочую область и использовать текущий API/TanStack Query pipeline.
- Не показывать устаревшую выдачу под новым запросом и сокращать хранение query/snippet в клиентском кеше.
- Сохранить обычный маршрутный flow и разрешение доступа источником истины.
- Проверить основные состояния Vitest/RTL и критический пользовательский путь Playwright.

**Non-Goals:**

- API/backend/schema changes, поиск на публичных страницах и клиентская авторизация.
- Breadcrumbs, дополнительный контекст сверх Search DTO, подсветка совпадений, собственная сортировка или дополнительные поисковые возможности.
- Новый глобальный store, command framework, UI dependency или отдельный search API client.

## Decisions

### FSD размещение и интеграция

Добавить feature `apps/web/src/features/page-search` с публичным export. `model` хранит локальные `query`, debounced query, active result и `open`; model использует существующий generated hook. `ui` содержит composition trigger + dialog + accessible result list. Feature принимает callback выбора результата от внешнего composition, не импортируя Next router. `PrivateWorkspace` остаётся тонким composition boundary: подключает feature в приватной шапке рядом с breadcrumbs/profile через минимальный header slot и передаёт `router.push(workspacePagePath(pageId))`. Поиск не размещается в editor или в page component, поэтому доступен на приватных workspace маршрутах, включая мобильный layout.

В `apps/web/src/shared/api/index.ts` добавить barrel exports для `useSearchPages`, `getSearchPagesQueryKey`, `searchPages` (только если нужен явный retry вызов; предпочтительно retry через query result) и generated DTO/params. Сами generated файлы и OpenAPI не редактировать.

### Query normalization, debounce и cache

Ограничить Input через `maxLength={200}` и нормализовать значение `trim()` перед запросом. Не вводить минимальный query length: backend разрешает любое непустое значение. Пустая строка отключает query. Debounce установить в 300 мс: это обычная короткая пауза, снижающая запросы при наборе, при этом поиск остаётся отзывчивым.

Query key формирует generated hook из нормализованных `{ query, limit: 20 }`. Не передавать `placeholderData`/`keepPreviousData`; пока debounced query не совпадает с нормализованным вводом, результаты и активный элемент скрыты, а UI сообщает ожидание debounce. Поэтому старый query не показывается как ответ нового. При смене ключа TanStack Query отменяет неактивный запрос через уже прокинутый AbortSignal; собственные race guards не нужны.

Установить `retry: false` и `staleTime: 0`: ошибки повторяются только по явному действию, а предыдущие результаты не считаются свежими. Не передавать `placeholderData`/`keepPreviousData`; UI скрывает результат, пока debounced query не совпадает с введённым. Search query observer монтируется только пока диалог открыт. Для поискового query задать `gcTime: 0`: после закрытия/смены ключа observer становится неактивным, и его приватные snippets удаляются TanStack Query без `removeQueries()` и без вмешательства в активный observer. При закрытии сбрасывать локальные query/selection. Query key включает normalized query и limit, не содержит пользовательских metadata.

Для завершения сессии использовать существующий `SessionProvider` как границу очистки: `clearSession` очищает QueryClient, а переход на другую user identity очищает cache до записи нового current user. Это покрывает search и остальные user-scoped queries единым механизмом; feature не создаёт cache manager.

### Dialog, focus и shortcut

Использовать `Dialog` primitives из `shared/ui`, `Input` и `Button`; диалог ограничить высотой viewport и сделать область результатов внутренне прокручиваемой. Одна явная кнопка в шапке доступна на всех ширинах. Открытие по shortcut подключается на время существования feature в приватной рабочей области: `metaKey` или `ctrlKey` + `k`, без Shift/Alt. Если dialog закрыт, shortcut игнорирует input/textarea/contenteditable targets и не забирает сочетания TipTap. Если dialog уже открыт, повторное сочетание предотвращает browser default, оставляет один dialog открытым и возвращает фокус в поле, не меняя query/selection.

Dialog trigger для UI-кнопки должен быть зарегистрированным `DialogTrigger`, а controlled shortcut открывает тот же `Dialog.Root`. Использовать встроенные `initialFocus`/`finalFocus` props Base UI, которые уже пробрасываются `DialogContent`: `initialFocus` направляет фокус в search input, `finalFocus` возвращает его на явный trigger. Так оба пути открытия используют один focus lifecycle; Escape, trap, overlay и return focus остаются у primitive. Допускается узкий вызов `inputRef.focus()` при повторном shortcut, поскольку повторное открытие не запускает новый lifecycle. Не добавлять ручной focus trap или собственный focus manager.

Поле выступает combobox с доступным label, `aria-expanded`, `aria-controls` и `aria-activedescendant`; список имеет `listbox`, варианты — `option` с `aria-selected`. При замене выдачи selection сбрасывается; ArrowUp/Down перемещают индекс только по текущему непустому массиву. Состояния loading/empty/error объявляются доступным live status. При закрытии диалога query/selection очищаются; повторное открытие начинается пустым.

### Навигация и отозванный доступ

Feature передаёт только `pageId` выбранной записи, закрывает dialog и очищает локальное состояние. `PrivateWorkspace` инвалидирует точный `getGetPageQueryKey(pageId)` для немедленного выбора текущей страницы, затем сразу вызывает `router.push(workspacePagePath(pageId))`; invalidation не ожидается. Для нового page route generated `useGetPage(pageId)` выполняет свежий permission-safe read.

Есть реальный cache gap в текущем route flow: persistent `PrivateWorkspace` не размонтирует tree observers при переходе; при отзыве permission старый tree всё ещё содержит страницу. `WorkspacePage` считает её доступной только по этому tree и может отрисовать старый title и смонтировать editor до обновления cache. Исправление относится к общему private page-route boundary, а не к Search feature: `PrivateWorkspace` проверяет текущий `/pages/{pageId}` через уже сгенерированный `useGetPage(pageId)` с refetch при каждом route entry, включая ранее закешированный `PageDto`. Пока свежий ответ загружается, route показывает нейтральный loading shell, скрывает page-specific crumbs и не монтирует `WorkspacePage` content/editor из tree cache. Свежий `PageDto` подтверждает доступ и даёт title/role; `403/404` переводятся в существующее neutral unavailable/error state и stale page detail не используется. При denied response page-scoped data очищается, а permission-filtered page tree/shared pages инвалидируются; shell не показывает route-specific stale metadata. Навигация не ждёт ни этот запрос, ни tree/shared refetch перед `router.push()`.

Фоновое tree/shared обновление не считается проверкой безопасности: доступ подтверждает только page endpoint, а target page surface скрывается до его свежего ответа. `PageDto` не содержит ancestor path; использовать generic shell без page-specific breadcrumbs и показывать sidebar ancestry только после обновления текущих permission-filtered tree queries. Не восстанавливать ancestry из search результатов.

Shared page проходит тем же `/pages/{pageId}` route guard; availability не должна зависеть от присутствия страницы в собственном page tree. Проверку разрешения выполняет backend endpoint, не новая frontend capabilities модель.

Snippet/title отображаются напрямую как React text nodes. Никакого HTML parsing, highlighting, полного документа, клиентского breadcrumb lookup или дополнительной сортировки.

### Проверки

Добавить feature tests рядом с реализацией на Vitest/RTL и использовать текущие generated MSW handlers с override-ами per test. Проверить сетевое поведение по фактическим `query`/`limit`, быстрые запросы/late responses, безопасный текст, фокус и ручной retry как для empty, так и для error state. Проверить route guard в `workspace-page.spec.tsx`: page detail refetch, revoked 403/404, stale PageDto/tree cache не попадает в crumbs/content/editor, shared page работает при отсутствии в owned tree и открывается через shared route flow.

В Playwright предпочесть подготовленную indexed page/search query fixture и дождаться готовности fixture в setup проверкой Search API, до основного UI-сценария. В текущем E2E репозитории нет search-specific ready fixture, поэтому допустимая альтернатива — dynamic test setup с уникальным page/text и ограниченным `expect.poll` по authenticated Search API. Не использовать произвольные sleeps/fixed delays и не переносить ожидание индексации в production UI. Основной сценарий: авторизация существующими credentials, workspace, `Cmd/Ctrl + K`, ввод query, выбор результата, проверка `/pages/{pageId}`. Отдельная мобильная проверка создаёт Playwright Chromium context с узким viewport и touch input; она проверяет существующий layout, видимые trigger/close, dialog без горизонтального overflow, прокрутку длинного списка, touch activation и доступность штатной mobile workspace navigation.

## Risks / Trade-offs

- [Persistent workspace tree cache может сохранить страницу после отзыва доступа] → page route повторно проверяет доступ через существующий generated page endpoint и не показывает cached route data до свежего ответа; tree/shared refresh после route push обновляет навигацию без задержки перед переходом.
- [Permission может измениться сразу после успешного page-read] → page GET не рассматривается как долгоживущая гарантия; editor/document APIs остаются backend permission boundary, а route не использует Search/Page cache как fallback при последующем отказе.
- [Search projection может ещё не содержать только что сохранённый текст] → нейтральный empty state и ручной retry; автоматического polling нет.
- [Глобальный shortcut пересекается с редактором и браузером] → перехватывать его лишь вне редактируемых элементов и не устанавливать handler вне приватной рабочей области.
- [Поисковый кеш может содержать приватные snippets после закрытия или смены пользователя] → search observer существует только при открытом dialog, `gcTime: 0` удаляет inactive entries, а SessionProvider очищает user-scoped QueryClient при logout/identity change; не вызывать `removeQueries()` для активного observer.
- [ARIA combobox/listbox требует синхронизации active descendant] → держать active index локально, сбрасывать/ограничивать при новом массиве и тестировать через доступные роли.

## Migration Plan

1. Экспортировать существующие generated search types/hook из `shared/api` и добавить feature с локальным состоянием, диалогом и feature tests.
2. Подключить кнопку/диалог и shortcut к приватной workspace композиции; route transition выполняется сразу, а общий page route boundary revalidates доступ и обновляет cached workspace trees без предшествующего ожидания.
3. Добавить Playwright happy path и выполнить web lint/typecheck/tests/build и `openspec validate add-web-page-search --strict` перед review реализации.

Изменение не требует миграции данных или координации backend deploy. Откат удаляет feature, её workspace composition и generated barrel exports; Search API остаётся без изменения.
