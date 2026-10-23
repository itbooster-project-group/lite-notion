## Purpose

Глобальный поиск помогает пользователю находить доступные страницы Lite Notion по названию и содержимому и открывать их из рабочей области.

## ADDED Requirements

### Requirement: Search is available throughout the private workspace
Приватная рабочая область MUST предоставлять явную кнопку поиска и MUST открывать диалог сочетанием `Cmd + K` на macOS и `Ctrl + K` на Windows/Linux. Сочетание MUST обрабатываться только как действие приложения, когда фокус не находится в редактируемом поле или редакторе, и MUST NOT перехватывать Escape и другие сочетания самого редактора. Явная кнопка MUST оставаться доступной на мобильной ширине.

#### Scenario: Open search with the platform shortcut
- **WHEN** пользователь нажимает `Meta + K` на macOS либо `Control + K` на Windows/Linux в не редактируемой области приватной рабочей области
- **THEN** открывается диалог поиска и фокус переходит в поле запроса

#### Scenario: Shortcut does not interrupt text editing
- **WHEN** диалог поиска закрыт, фокус находится во внешнем input, textarea или contenteditable редакторе и пользователь нажимает `Cmd/Ctrl + K`
- **THEN** поиск не открывается, а приложение не отменяет обработку сочетания активным редактором

#### Scenario: Open search from an explicit control
- **WHEN** пользователь активирует кнопку поиска мышью или клавиатурой, в том числе на мобильном устройстве
- **THEN** открывается тот же диалог поиска с фокусом в поле запроса

#### Scenario: Repeated shortcut keeps one dialog open
- **GIVEN** диалог поиска уже открыт
- **WHEN** пользователь повторно нажимает `Cmd/Ctrl + K`
- **THEN** остаётся открытым один диалог, query и selection не меняются, а фокус остаётся в поле поиска

#### Scenario: Shortcut opening does not conflict with TipTap
- **WHEN** фокус находится в TipTap editor и пользователь нажимает `Cmd/Ctrl + K`
- **THEN** приложение не открывает поиск и не отменяет обработку сочетания editor

### Requirement: Search query follows the Search API contract
Поиск MUST отправлять запросы через существующий Search API и MUST использовать только непустой query после trim. UI MUST ограничивать ввод 200 символами, MUST разрешать запросы любой ненулевой длины, поскольку backend не задаёт минимальную длину, и MUST NOT выполнять запрос для пустой или пробельной строки. Запрос MUST отправляться после debounce около 300 мс. Результаты MUST относиться только к текущему debounced query; UI MUST NOT показывать результаты предыдущего query как актуальные во время debounce, загрузки или ответа более раннего запроса. Порядок и состав результатов полностью определяются API.

#### Scenario: Empty query does not call Search API
- **WHEN** поле пустое или после trim содержит только пробелы
- **THEN** Search API не вызывается и отображается начальное состояние диалога

#### Scenario: Short non-empty query follows backend behavior
- **WHEN** пользователь вводит непустой query длиной меньше backend maximum, включая один символ
- **THEN** нормализованный query отправляется после debounce, а результат определяется Search API

#### Scenario: Query is trimmed and bounded
- **WHEN** пользователь вводит query с пробелами по краям или достигает максимальной длины поля
- **THEN** запрос содержит trim-нутый query длиной не более 200 символов

#### Scenario: Debounce avoids a request per keystroke
- **WHEN** пользователь быстро вводит несколько символов
- **THEN** поиск выполняется для последнего значения после debounce, а промежуточные значения не создают отдельные запросы после каждого нажатия

#### Scenario: Late response cannot replace current results
- **WHEN** быстрый ввод создаёт запросы для разных query и более ранний ответ приходит после актуального
- **THEN** отображаются только результаты, соответствующие текущему query

### Requirement: Search dialog communicates query states accessibly
Диалог MUST различать начальное состояние пустого запроса, ожидание debounce, initial loading, обновление результата, результаты, пустой результат и ошибку. При новом query предыдущие результаты MUST немедленно скрываться до получения результатов этого query. Диалог MUST предоставлять ручное действие повтора и при ошибке, и при пустом результате; повтор MUST повторно отправлять текущий query через существующий query observer без изменения ввода. Ошибка MUST быть понятной и MUST NOT показывать сырые backend/storage сообщения. Пустой результат MUST сообщать нейтральное «Ничего не найдено» и MUST NOT утверждать, что страница не существует или что индекс отстаёт. Dialog MUST оставаться адаптивным, иметь доступное имя и label поля, сохранять фокус в поле при обновлении результатов и передавать управление модальным focus lifecycle существующему UI primitive.

#### Scenario: Debounce and initial loading are distinguishable
- **WHEN** пользователь вводит непустой query и debounce ещё не завершился, а затем Search API выполняется
- **THEN** интерфейс сообщает ожидание и загрузку как состояния поиска, не смешивая их с пустым результатом

#### Scenario: Results are shown for the current query
- **WHEN** Search API успешно возвращает результаты текущего query
- **THEN** диалог показывает список результатов и текущий выбранный элемент, если он есть

#### Scenario: No results are neutral
- **WHEN** Search API возвращает пустой массив
- **THEN** диалог показывает «Ничего не найдено» и действие «Повторить поиск», не делая вывод о существовании страницы или свежести индекса

#### Scenario: Search error can be retried
- **WHEN** Search API завершается ошибкой
- **THEN** внутри диалога отображается понятная ошибка и действие повтора без сырых деталей backend

#### Scenario: Retry repeats the active query
- **WHEN** пользователь активирует повтор после ошибки
- **THEN** API повторно запрашивает текущий query и диалог остаётся открытым

#### Scenario: Empty-state retry sends another request
- **GIVEN** Search API вернул пустой массив для текущего query
- **WHEN** пользователь нажимает «Повторить поиск»
- **THEN** тот же query запрашивается повторно без изменения текста в поле и без автоматического polling

#### Scenario: Results update without moving focus
- **WHEN** список обновляется после нового query или ручного retry
- **THEN** фокус остаётся в поле поиска, а не переносится на результат или контейнер списка

### Requirement: Search results contain only safe API metadata
Для результата UI MUST показывать только возвращаемые Search API `title` и `snippet`; `snippet` MUST быть необязательным, а его значение MUST отображаться как обычный экранируемый текст. UI MUST NOT использовать HTML интерпретацию или `dangerouslySetInnerHTML`, MUST NOT показывать полный текст документа и MUST NOT восстанавливать breadcrumbs или project/ancestor names из клиентского дерева. Если API не возвращает безопасный контекст, результат показывается без него.

#### Scenario: Result has a snippet
- **WHEN** API возвращает `title` и непустой `snippet`
- **THEN** оба значения отображаются как текст в соответствующем результате

#### Scenario: Result has no snippet
- **WHEN** API возвращает `snippet: null`
- **THEN** отображается title без пустого или выдуманного excerpt

#### Scenario: HTML-like snippet stays text
- **WHEN** title или snippet содержит символы и строку, похожие на HTML markup
- **THEN** текст показывается буквально и не создаёт исполняемую разметку

#### Scenario: Search result does not reveal ancestors
- **WHEN** результат относится к странице под недоступным ancestor или проектом
- **THEN** UI показывает только поля Search API и не добавляет title или metadata ancestor/project из клиентского cache

### Requirement: Search results support keyboard and pointer selection
Диалог MUST поддерживать `ArrowDown` и `ArrowUp` для выбора результата, `Enter` для открытия выбранного результата и `Escape` для закрытия диалога. Активный результат MUST быть доступен через корректные ARIA roles и состояние active descendant; обновление данных MUST сохранять фокус в поле и MUST сбрасывать или корректировать выбор, если активная строка больше не существует. Выбор MUST быть доступен указателем. После закрытия диалога временный query и активный результат MUST очищаться, а Base UI Dialog MUST вернуть фокус на зарегистрированную кнопку trigger независимо от того, был ли dialog открыт trigger или shortcut.

#### Scenario: Move selection with arrow keys
- **WHEN** пользователь перемещается по непустому списку с помощью ArrowDown и ArrowUp
- **THEN** активный результат меняется в пределах списка и отражается в доступном состоянии диалога

#### Scenario: Open selected result with Enter
- **WHEN** результат выбран и пользователь нажимает Enter
- **THEN** диалог закрывается и приложение начинает штатный переход на выбранную страницу

#### Scenario: Select result with pointer
- **WHEN** пользователь активирует результат указателем
- **THEN** выполняется тот же переход, что и при Enter

#### Scenario: Close and reopen clears temporary search state
- **WHEN** пользователь закрывает диалог через Escape и открывает его снова
- **THEN** поле и выбранный результат пусты, а фокус возвращается в поле поиска

#### Scenario: Escape restores focus after either opening method
- **WHEN** пользователь открывает поиск кнопкой или shortcut и закрывает его клавишей Escape
- **THEN** dialog закрывается, а Base UI возвращает фокус на кнопку поиска

### Requirement: Navigation rechecks current workspace access
Выбор результата MUST немедленно закрыть диалог, очистить его временные данные и начать переход через штатный маршрут `/pages/{pageId}` без ожидания workspace tree/shared requests. Результат Search API MUST NOT считаться гарантией действующего доступа. Существующий private page-route flow MUST подтвердить доступ свежим ответом generated page-read endpoint до показа page-specific title, content или editor; cached page/tree metadata MUST NOT использоваться как подтверждение. Workspace tree/shared queries MAY инвалидироваться без ожидания до `router.push`, а route flow MUST обновлять их после перехода. `403/404` MUST показывать штатное нейтральное unavailable/error состояние без поискового fallback и без клиентского дублирования authorization rules. Страница, доступная через sharing, MUST открываться тем же flow независимо от её наличия в собственном page tree.

#### Scenario: Access is revoked after search
- **WHEN** доступ к результату отозван после поиска, но до перехода
- **THEN** приложение сразу начинает route transition, page route ждёт текущий permission-safe page-read response, затем показывает unavailable/error state и не показывает title/content/editor из stale search/page/tree cache

#### Scenario: Search navigation closes the dialog
- **WHEN** пользователь открывает страницу из результата
- **THEN** поиск закрывается до отображения целевого workspace screen и очищает временный query/result state

#### Scenario: Navigation failure uses the normal workspace state
- **WHEN** page-read для целевого маршрута возвращает `403`, `404` либо ошибку API
- **THEN** приложение показывает существующее нейтральное unavailable/error state, а Search UI не подменяет его приватными данными или отдельной логикой разрешений

#### Scenario: Shared page opens without being in the owned tree
- **GIVEN** у пользователя нет собственной страницы в соответствующем проекте, но у него есть разрешённый доступ к shared page
- **WHEN** пользователь находит страницу через Search API и выбирает результат
- **THEN** приложение открывает её через `/pages/{pageId}` и существующий permission/navigation flow без требования присутствия в owned page tree

#### Scenario: Revoked shared-page access is denied by route flow
- **GIVEN** пользователь нашёл shared page, после чего доступ к ней отозвали
- **WHEN** пользователь выбирает результат поиска
- **THEN** свежий page-read response не разрешает страницу, и интерфейс показывает нейтральное unavailable/error состояние без stale title/content

### Requirement: Search data is isolated between user sessions
Search results and other user-scoped query data MUST NOT remain available after logout/session expiration or when a different user authenticates in the same application QueryClient. Cleanup MUST use the existing session lifecycle and MUST NOT add a search-specific cache manager.

#### Scenario: Logout clears private search results
- **WHEN** текущая пользовательская сессия завершается
- **THEN** search result data удаляется из QueryClient и не появляется при последующем входе

#### Scenario: Switching users cannot reuse the previous user's data
- **WHEN** в том же приложении аутентифицируется другой пользователь
- **THEN** его workspace/search queries загружаются заново и не содержат данные предыдущего пользователя

### Requirement: Search respects eventual consistency
Web-поиск MUST трактовать Search API как eventual-consistent представление сохранённого содержимого. UI MUST NOT обещать мгновенную индексацию, MUST NOT запускать polling ради ожидания индексации и MUST NOT показывать сообщение об отставании индекса без соответствующего поля API. Пользователь MUST иметь возможность вручную повторить запрос.

#### Scenario: Newly saved content is not yet indexed
- **WHEN** новый текст ещё не доступен через Search API
- **THEN** пустой массив отображается нейтрально как «Ничего не найдено» без утверждения, что страница отсутствует

#### Scenario: User retries eventual search manually
- **WHEN** пользователь повторяет текущий поиск вручную
- **THEN** приложение выполняет новый запрос без автоматического polling

#### Scenario: Search trigger and dialog work on a narrow viewport
- **WHEN** пользователь открывает поиск на узком мобильном экране
- **THEN** trigger и close button доступны, dialog помещается в viewport без горизонтального переполнения, длинный список прокручивается внутри dialog, а результат можно открыть касанием без конфликта со штатной навигацией workspace
