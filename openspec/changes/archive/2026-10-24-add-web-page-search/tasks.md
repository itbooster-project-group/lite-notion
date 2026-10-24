## 1. Подготовить API boundary и feature

- [x] 1.1 Добавить в публичный barrel `apps/web/src/shared/api/index.ts` exports существующего generated Search hook, query key и типов; generated source и OpenAPI оставить без изменений.
- [x] 1.2 Создать `features/page-search` public API и локальную модель query/open/selection с debounce 300 мс, trim, пределом 200 символов и состояниями текущего query.
- [x] 1.3 Подключить `useSearchPages` с generated query key, `enabled` только для текущего непустого debounced query, AbortSignal, `retry: false`, `staleTime: 0`, `gcTime: 0` и без previous-data placeholder; монтировать query observer только пока открыт dialog и не вызывать `removeQueries()`.
- [x] 1.4 Обновить session cleanup в существующем `SessionProvider`: очищать user-scoped QueryClient при завершении сессии и при входе другого пользователя; добавить проверку, что search/workspace cache не переживает смену identity.
- [x] 1.5 Расширить текущий PostgreSQL FTS query в `SearchRepository`: преобразовать lexemes из parameterized `websearch_to_tsquery` в prefix terms, сохранить multiword/operator semantics, permission filtering, порядок и revision guard; не менять API/DTO или GIN schema.
- [x] 1.6 Разрешить существующему document projection принимать TipTap heading levels H1–H6 и проверить их индексирование; не менять editor UI или extractor.

## 2. Реализовать диалог поиска

- [x] 2.1 Создать адаптивный search dialog на публичных `shared/ui` Dialog/Input/Button primitives с доступными combobox/listbox ролями и автоматическим focus через primitive.
- [x] 2.2 Реализовать нейтральные состояния empty query, debounce, initial/background loading, results, no results и error; empty и error states получают ручной retry текущего query через `refetch()` без raw API errors.
- [x] 2.3 Показать только Search DTO title/snippet как текст, включая `snippet: null`; не добавлять breadcrumb, HTML parsing, highlighting или клиентскую сортировку.
- [x] 2.4 Реализовать ArrowUp/ArrowDown, Enter, Escape, pointer selection, сброс невалидного active result и очистку локальных query/selection при закрытии; cache очищается через `gcTime: 0` после unmount observer, не через принудительное удаление активного query.

## 3. Подключить приватную workspace композицию и навигацию

- [x] 3.1 Добавить явный доступный trigger в приватную шапку на desktop и mobile и подключить `Cmd/Ctrl + K`, игнорируя editable targets и сохраняя штатные сочетания editor.
- [x] 3.2 Подключить selection callback из `PrivateWorkspace` к существующему `/pages/{pageId}` navigation flow: закрыть и очистить search state, инвалидировать точный generated page query key без await, затем сразу вызвать `router.push()` независимо от завершения любых workspace requests.
- [x] 3.3 Исправить page-route permission flow на свежем `useGetPage(pageId)`, даже при cached PageDto; до завершения refetch скрывать cached title/breadcrumb/editor/sidebar labels, при `403/404` показывать существующий neutral state и не использовать Search/Page/tree cache как fallback.
- [x] 3.4 Не блокировать page render workspace queries: при смене page route обновлять tree/shared в фоне, скрывать их stale labels до успешного ответа, показывать только текущий title из свежего PageDto и синхронизировать PageDto cache при rename.

## 4. Покрыть поведение тестами

- [x] 4.1 Добавить Vitest/RTL tests на открытие trigger и shortcut отдельно, initial/final focus для обоих путей, Escape, фокус после обновления результатов, повторный shortcut без второго dialog, поведение внутри TipTap/editable targets, debounce/trim/max length, пустой и однобуквенный query.
- [x] 4.2 Добавить Vitest/RTL tests с MSW request counts: пустой query не вызывает API, fast query changes и late responses не показывают устаревшую выдачу, смена query во время loading отменяет/скрывает предыдущий результат, ручной retry отправляет новый HTTP request и из empty state, и из error state.
- [x] 4.3 Добавить Vitest/RTL tests на snippet/null и HTML-like plain text, loading/empty/error/retry, клавиатурный/pointer selection, `router.push()` до завершения задержанных page/tree/shared requests.
- [x] 4.4 Добавить route/session tests: cached PageDto/tree + endpoint `403/404` не рендерят stale private metadata; отозванный ancestor скрыт до обновления дерева; медленный page-read не скрывает готовую navigation; свежий page endpoint `200` открывает shared page вне workspace tree; ошибка workspace metadata не блокирует page content; `router.push()` не ждёт tree/shared; protected editor/document отказ не получает Search/Page cache fallback; logout/user switch очищает cache.
- [x] 4.5 Добавить Playwright happy path на заранее индексированной search fixture с readiness check в test setup. Если E2E setup не имеет готовой fixture, подготовить уникальную страницу и ограниченно ждать появления результата через authenticated Search API `expect.poll`; не использовать arbitrary sleep/fixed delay и не добавлять polling в product UI.
- [x] 4.6 Добавить Playwright mobile Chromium context с узким viewport и `hasTouch`: trigger и close доступны, dialog помещается без горизонтального overflow, длинный список прокручивается, результат открывается касанием и штатная mobile workspace navigation остаётся доступной.
- [x] 4.7 Запустить OpenSpec strict validation и web lint/typecheck/Vitest/build плюс Playwright E2E, исправить выявленные ошибки и отметить задачи выполненными только после проверки.
- [x] 4.8 Запустить Search API PostgreSQL integration tests на реальной БД для полного слова/префикса title и body, H1–H6, paragraphs, mixed language/digits, multiword, quotes/OR/negative/special input, permissions, stale projection, rank и GIN eligibility.
- [x] 4.9 Выполнить финальные API unit/integration tests, web Vitest, API/web typecheck, lint, web build, Playwright E2E и `openspec validate add-web-page-search --strict`; проверить итоговый PR diff на лишние изменения.
