## 1. Подготовить API boundary и feature

- [x] 1.1 Добавить в публичный barrel `apps/web/src/shared/api/index.ts` exports существующего generated Search hook, query key и типов; generated source и OpenAPI оставить без изменений.
- [x] 1.2 Создать `features/page-search` public API и локальную модель query/open/selection с debounce 300 мс, trim, пределом 200 символов и состояниями текущего query.
- [x] 1.3 Подключить `useSearchPages` с generated query key, `enabled` только для текущего непустого debounced query, AbortSignal, `retry: false`, `staleTime: 0`, `gcTime: 0` и без previous-data placeholder; монтировать query observer только пока открыт dialog и не вызывать `removeQueries()`.
- [x] 1.4 Обновить session cleanup в существующем `SessionProvider`: очищать user-scoped QueryClient при завершении сессии и при входе другого пользователя; добавить проверку, что search/workspace cache не переживает смену identity.

## 2. Реализовать диалог поиска

- [x] 2.1 Создать адаптивный search dialog на публичных `shared/ui` Dialog/Input/Button primitives с доступными combobox/listbox ролями и автоматическим focus через primitive.
- [x] 2.2 Реализовать нейтральные состояния empty query, debounce, initial/background loading, results, no results и error; empty и error states получают ручной retry текущего query через `refetch()` без raw API errors.
- [x] 2.3 Показать только Search DTO title/snippet как текст, включая `snippet: null`; не добавлять breadcrumb, HTML parsing, highlighting или клиентскую сортировку.
- [x] 2.4 Реализовать ArrowUp/ArrowDown, Enter, Escape, pointer selection, сброс невалидного active result и очистку локальных query/selection при закрытии; cache очищается через `gcTime: 0` после unmount observer, не через принудительное удаление активного query.

## 3. Подключить приватную workspace композицию и навигацию

- [x] 3.1 Добавить явный доступный trigger в приватную шапку на desktop и mobile и подключить `Cmd/Ctrl + K`, игнорируя editable targets и сохраняя штатные сочетания editor.
- [x] 3.2 Подключить selection callback из `PrivateWorkspace` к существующему `/pages/{pageId}` navigation flow: закрыть и очистить search state, инвалидировать точный generated page query key без await, затем сразу вызвать `router.push()` независимо от завершения любых workspace requests.
- [x] 3.3 Исправить общий page-route permission flow: повторно читать страницу через существующий generated `useGetPage(pageId)` на каждом route entry, включая cached PageDto; пока свежий ответ выполняется, показывать neutral shell без route-specific crumbs и не монтировать `WorkspacePage` content/editor из tree cache; `403/404` переводить в штатное neutral unavailable/error state.
- [x] 3.4 После route transition обновлять permission-filtered page tree/shared pages без задержки `router.push()`; не показывать cached ancestor/sidebar metadata до успешного обновления, а при denied page очистить stale page data. Проверить page endpoint `200` для shared page вне owned tree.

## 4. Покрыть поведение тестами

- [x] 4.1 Добавить Vitest/RTL tests на открытие trigger и shortcut отдельно, initial/final focus для обоих путей, Escape, фокус после обновления результатов, повторный shortcut без второго dialog, поведение внутри TipTap/editable targets, debounce/trim/max length, пустой и однобуквенный query.
- [x] 4.2 Добавить Vitest/RTL tests с MSW request counts: пустой query не вызывает API, fast query changes и late responses не показывают устаревшую выдачу, смена query во время loading отменяет/скрывает предыдущий результат, ручной retry отправляет новый HTTP request и из empty state, и из error state.
- [x] 4.3 Добавить Vitest/RTL tests на snippet/null и HTML-like plain text, loading/empty/error/retry, клавиатурный/pointer selection, `router.push()` до завершения задержанных page/tree/shared requests.
- [x] 4.4 Добавить route/session tests: cached private tree + page endpoint `403/404` не рендерят stale title/breadcrumb/sidebar/editor; fresh page endpoint `200` открывает shared page даже при её отсутствии в owned tree; отказ protected editor/document request после успешного page-read не использует Search/Page cache как fallback; logout и user switch удаляют search/workspace cache.
- [x] 4.5 Добавить Playwright happy path на заранее индексированной search fixture с readiness check в test setup. Если E2E setup не имеет готовой fixture, подготовить уникальную страницу и ограниченно ждать появления результата через authenticated Search API `expect.poll`; не использовать arbitrary sleep/fixed delay и не добавлять polling в product UI.
- [x] 4.6 Добавить Playwright mobile Chromium context с узким viewport и `hasTouch`: trigger и close доступны, dialog помещается без горизонтального overflow, длинный список прокручивается, результат открывается касанием и штатная mobile workspace navigation остаётся доступной.
- [x] 4.7 Запустить OpenSpec strict validation и web lint/typecheck/Vitest/build плюс Playwright E2E, исправить выявленные ошибки и отметить задачи выполненными только после проверки.
