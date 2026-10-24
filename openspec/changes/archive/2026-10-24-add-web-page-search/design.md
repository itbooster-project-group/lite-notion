## Context

См. `proposal.md` и `specs/web-page-search/spec.md`. PR #105 уже содержит frontend Search feature и backend Search API из capability `page-search`; этот change уточняет prefix matching и отделяет подтверждение доступа к странице от обновления permission-filtered navigation metadata.

- Search API: `apps/api/src/search/dto/search-query.dto.ts`, `apps/api/src/search/search.controller.ts`, `apps/api/src/search/search-read.service.ts`, `apps/api/openapi.json`. `GET /api/v1/search` принимает обязательный `query` до 200 символов и optional integer `limit` 1–50 (default 20); backend trim-ит query и возвращает `[]` для пустой строки. Минимальной длины нет. DTO ответа — `{ pageId, title, snippet: string | null }`.
- Orval уже создал `useSearchPages`, query key и query options в `apps/web/src/shared/api/generated/search/search.ts`; query function передаёт TanStack `signal` в `apiFetch`. `SearchPagesParams` и `SearchResultDto` находятся в generated model. `apps/web/src/shared/api/index.ts` пока не публикует эти exports. Сгенерированный MSW handler уже доступен в `search/search.msw.ts` и включён в `generated/index.msw.ts`.
- Частная рабочая область компонуется в `apps/web/src/app/layouts/private-workspace.tsx`; `PrivateShell` предоставляет header composition, а `AppShell` — постоянную sidebar и мобильный modal sidebar. Страницы открываются по `/pages/{pageId}` через `workspacePagePath` и `router.push`.
- Shared `Dialog`, `DialogContent`, `DialogTitle`, `Input`, `Button` экспортируются из `apps/web/src/shared/ui`. Base UI dialog уже управляет Escape, modal focus и возвратом фокуса; существующие тесты этих свойств есть в `shared/ui/overlays.spec.tsx` и workspace dialog tests.
- `workspace-page.tsx` получает page route metadata из permission-filtered tree/shared pages, а `PrivateWorkspace` живёт в постоянном private layout. Route вызывает generated `useGetPage(pageId)` с `staleTime: 0` и `refetchOnMount: 'always'`; cached DTO сам по себе не подтверждает текущий доступ. Tree/shared данные также могут содержать stale ancestor metadata, поэтому при смене page route они обновляются без ожидания page render.
- `SessionProvider.clearSession` сейчас удаляет только current-user и asset-read-url entries, а смена пользователя очищает только asset-read-url cache. Следовательно, search/query cache может пережить logout или переключение пользователя.

## Goals / Non-Goals

**Goals:**

- Добавить доступную поисковую палитру в существующую приватную рабочую область и использовать текущий API/TanStack Query pipeline.
- Не показывать устаревшую выдачу под новым запросом и сокращать хранение query/snippet в клиентском кеше.
- Сохранить обычный маршрутный flow и разрешение доступа источником истины.
- Искать начала слов в title и свежей projection через существующий PostgreSQL FTS без нового индекса и без изменения разрешений.
- Проверить основные состояния Vitest/RTL и критический пользовательский путь Playwright.

**Non-Goals:**

- Новый endpoint/DTO, миграция или индекс БД, морфологический/fuzzy/trigram/semantic search, поиск на публичных страницах и клиентская авторизация.
- Breadcrumbs, дополнительный контекст сверх Search DTO, подсветка совпадений, собственная сортировка или дополнительные поисковые возможности.
- Новый глобальный store, command framework, UI dependency или отдельный search API client.

## Decisions

### FSD размещение и интеграция

Добавить feature `apps/web/src/features/page-search` с публичным export. `model` хранит локальные `query`, debounced query, active result и `open`; model использует существующий generated hook. `ui` содержит composition trigger + dialog + accessible result list. Feature принимает callback выбора результата от внешнего composition, не импортируя Next router. `PrivateWorkspace` остаётся тонким composition boundary: подключает feature в приватной шапке рядом с breadcrumbs/profile через минимальный header slot и передаёт `router.push(workspacePagePath(pageId))`. Поиск не размещается в editor или в page component, поэтому доступен на приватных workspace маршрутах, включая мобильный layout.

В `apps/web/src/shared/api/index.ts` добавить barrel exports для `useSearchPages`, `getSearchPagesQueryKey`, `searchPages` (только если нужен явный retry вызов; предпочтительно retry через query result) и generated DTO/params. Сами generated файлы и OpenAPI не редактировать.

### Prefix matching в существующем PostgreSQL FTS

В `SearchRepository` сначала разобрать параметризованный пользовательский ввод существующей `websearch_to_tsquery('simple', $query)`, затем преобразовать только сформированные PostgreSQL quoted lexemes в prefix terms с `:*` и привести результат обратно к `tsquery`. Сырая строка пользователя не становится SQL/tsquery source: она передаётся через Prisma tagged `$queryRaw`, а grammar operators берутся только из результата `websearch_to_tsquery`.

Префикс применяется к каждому распознанному term, не меняя сгенерированные `&`, `|`, отрицания и phrase adjacency. Поэтому некавычные слова сохраняют текущую AND-семантику в пределах одного поля, `OR`, `-term` и кавычки сохраняют семантику `websearch_to_tsquery`, а query только из отрицаний по-прежнему отсекается `querytree`. Пунктуация/оператороподобный ввод разбирается PostgreSQL parser-ом и не исполняется как SQL. Морфология и отдельный универсальный parser не добавляются.

Одинаковое prefix tsquery используется для candidate selection и финального чтения/snippet predicate. Это поддерживает title search без body projection, но применяет к body только projection с `sourceStorageRevision = storageRevision`. Существующие `Page_title_search_idx` и GIN index `PageSearchDocument.searchVector` принимают prefix `tsquery`; SQL/integration test проверяет планы с тем же преобразованием. Схема БД и projection revision guard не меняются. Document projection validator принимает существующие TipTap heading levels H1–H6; web editor при этом сохраняет свои текущие уровни и UI не меняется.

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

Feature передаёт только `pageId`, закрывает dialog и очищает локальное состояние. `PrivateWorkspace` может инвалидировать точный `getGetPageQueryKey(pageId)` без ожидания и сразу вызвать `router.push(workspacePagePath(pageId))`.

Существующий `useGetPage(pageId)` — единственное подтверждение доступа для page route: query включается при URL `/pages/{pageId}`, `staleTime: 0`, `retry: false`, `refetchOnMount: 'always'`. Эти настройки должны заставлять TanStack Query выполнить свежий GET даже при cached PageDto. Пока query `isPending` или `isFetching`, page context считается неподтверждённым: `WorkspacePage` не показывает title, breadcrumbs, editor или данные дерева для целевой страницы. После свежего `200` текущий PageDto становится источником страницы/title/accessRole; permission-filtered trees используются только для доступной навигационной metadata и не являются условием открытия страницы. `403/404` переходят в существующий нейтральный unavailable state, прочая ошибка — в page-level error/retry; stale detail не используется. При denied/error page access shell не показывает cached workspace tree/shared labels.

При смене page id запускать `treeQuery.refetch()` и `sharedPagesQuery.refetch()` без ожидания; `projectsQuery` не обновлять только из-за смены page route. Пока owned/shared permission-filtered дерево обновляется или завершилось ошибкой, не использовать его cached labels для sidebar и breadcrumbs. Свежий PageDto может показать только текущий title; успешный ответ соответствующего дерева восстанавливает доступные ancestors. Ни router transition, ни page content не ждут tree/shared requests. Их ошибка не блокирует страницу при свежем page `200`, даже если страница отсутствует в owned/shared tree. Обычные route links, browser back/forward и project navigation остаются существующими механизмами Next router. Page management rename synchronizes cached PageDto вместе с tree cache, чтобы подтверждённая page DTO не ломала текущий optimistic title update.

Search result и успешный page read не являются долговременной гарантией permission: document/editor API остаётся backend authorization boundary и его отказ не получает fallback из Search/Page cache. Не добавлять клиентскую permissions-модель и не восстанавливать breadcrumbs поиска из недоступных ancestors.

Snippet/title отображаются напрямую как React text nodes. Никакого HTML parsing, highlighting, полного документа, клиентского breadcrumb lookup или дополнительной сортировки.

### Проверки

Добавить feature tests рядом с реализацией на Vitest/RTL и использовать текущие generated MSW handlers с override-ами per test. Проверить сетевое поведение по фактическим `query`/`limit`, быстрые запросы/late responses, безопасный текст, фокус и ручной retry как для empty, так и для error state. Проверить route guard в `workspace-page.spec.tsx`: page detail refetch, revoked 403/404, stale PageDto/tree cache не попадает в crumbs/content/editor, shared page работает при отсутствии в owned tree и открывается через shared route flow.

В Playwright предпочесть подготовленную indexed page/search query fixture и дождаться готовности fixture в setup проверкой Search API, до основного UI-сценария. В текущем E2E репозитории нет search-specific ready fixture, поэтому допустимая альтернатива — dynamic test setup с уникальным page/text и ограниченным `expect.poll` по authenticated Search API. Не использовать произвольные sleeps/fixed delays и не переносить ожидание индексации в production UI. Основной сценарий: авторизация существующими credentials, workspace, `Cmd/Ctrl + K`, ввод query, выбор результата, проверка `/pages/{pageId}`. Отдельная мобильная проверка создаёт Playwright Chromium context с узким viewport и touch input; она проверяет существующий layout, видимые trigger/close, dialog без горизонтального overflow, прокрутку длинного списка, touch activation и доступность штатной mobile workspace navigation.

## Risks / Trade-offs

- [Persistent workspace cache может сохранить страницу после отзыва доступа] → page route всегда re-fetch-ит существующий generated page endpoint и скрывает private route surface и cached navigation до свежего ответа; при отказе private navigation не отображается.
- [Tree/shared metadata может содержать отозванные ancestors или завершиться ошибкой] → при смене page id permission-filtered queries обновляются в фоне; их cached labels скрыты до успешного ответа, а PageDto даёт текущий title и открывает страницу без ожидания дерева.
- [Prefix tsquery меняет поиск с token equality на token-prefix] → изменение ограничено началом каждой FTS lexeme; OR, отрицания, quoted phrase и порядок релевантности сохраняются; отдельные тесты выполняются на PostgreSQL.
- [Permission может измениться сразу после успешного page-read] → page GET не рассматривается как долгоживущая гарантия; editor/document APIs остаются backend permission boundary, а route не использует Search/Page cache как fallback при последующем отказе.
- [Search projection может ещё не содержать только что сохранённый текст] → нейтральный empty state и ручной retry; автоматического polling нет.
- [Глобальный shortcut пересекается с редактором и браузером] → перехватывать его лишь вне редактируемых элементов и не устанавливать handler вне приватной рабочей области.
- [Поисковый кеш может содержать приватные snippets после закрытия или смены пользователя] → search observer существует только при открытом dialog, `gcTime: 0` удаляет inactive entries, а SessionProvider очищает user-scoped QueryClient при logout/identity change; не вызывать `removeQueries()` для активного observer.
- [ARIA combobox/listbox требует синхронизации active descendant] → держать active index локально, сбрасывать/ограничивать при новом массиве и тестировать через доступные роли.

## Migration Plan

1. Экспортировать существующие generated search types/hook из `shared/api` и добавить feature с локальным состоянием, диалогом и feature tests.
2. Подключить кнопку/диалог и shortcut к приватной workspace композиции; page route использует свежий `GET /pages/{pageId}` и параллельно обновляет permission-filtered navigation без ожидания дерева.
3. Добавить prefix matching в действующий SearchRepository и реальные PostgreSQL integration cases, не меняя Search API contract и индексы.
4. Проверить route guard, web UX, API tests, PostgreSQL integration suite и OpenSpec strict validation перед review реализации.

Изменение не требует миграции данных, generated API или координации DB schema. Для prefix matching нужен backend deploy, Search endpoint и DTO остаются совместимыми. Откат удаляет prefix transformation/validator allowance и web route изменения; существующая Search projection остаётся пригодной.
