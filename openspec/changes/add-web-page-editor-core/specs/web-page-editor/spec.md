## Purpose

Определяет versioned contract содержимого страницы, transport-neutral editor session, доступные editing flows и безопасное представление документа в интерактивном и будущем статическом renderer.

## ADDED Requirements

### Requirement: Yjs является единственным источником истины рабочего документа

Система MUST использовать `Y.Doc` как единственный authoritative mutable state редактируемого документа. Система MUST NOT создавать authoritative TipTap JSON, block CRUD или вторую mutable-копию содержимого в TanStack Query. При работе TipTap Collaboration/Yjs стандартный history extension MUST быть отключён как competing undo stack.

#### Scenario: Пользователь изменяет документ
- **WHEN** editor command изменяет содержимое страницы
- **THEN** изменение записывается в текущий `Y.Doc`, а отдельная authoritative JSON- или Query-копия не создаётся

#### Scenario: Пользователь отменяет локальное изменение
- **WHEN** для текущего клиента доступно undo или redo
- **THEN** операция выполняется history mechanism, совместимым с Yjs collaboration model, без параллельного стандартного history stack

### Requirement: Schema version 1 является persisted contract

Система SHALL определять одну versioned schema для document, text, paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold, italic, strike, inline code, link, image, YouTube и direct video. Names, attrs, defaults и validation rules schema v1 MUST быть стабильными для persisted Yjs state и derived publication JSON.

#### Scenario: Документ использует поддерживаемую schema
- **WHEN** session получает state со schema version 1
- **THEN** editor и schema-aware conversion используют один и тот же contract nodes, marks, attrs и defaults

#### Scenario: Документ использует неизвестную schema
- **WHEN** session получает state с неподдерживаемой schema version
- **THEN** система показывает блокирующее состояние несовместимости, не создаёт editable surface и не сохраняет документ поверх неизвестного state

#### Scenario: Encoded state повреждён
- **WHEN** schema version поддерживается, но Yjs state нельзя безопасно декодировать
- **THEN** система показывает блокирующую безопасную ошибку и не заменяет state пустым документом

### Requirement: Schema v1 поддерживает детерминированный static rendering

Каждый custom node и mark schema v1 MUST иметь стабильный JSON contract, validation и детерминированное non-editor representation. React NodeView MUST NOT быть единственным способом представить node. Pipeline `Y.Doc → TipTap/ProseMirror JSON → static renderer` MUST выдавать deterministic output для одной schema version без монтирования interactive editor.

#### Scenario: Publication pipeline получает поддерживаемый документ
- **WHEN** schema-aware conversion создаёт derived JSON из `Y.Doc` version 1
- **THEN** static renderer может представить все nodes/marks без React NodeView и с теми же validated attrs

#### Scenario: Одинаковый snapshot рендерится повторно
- **WHEN** static renderer дважды получает одинаковый versioned derived JSON
- **THEN** структурный HTML/React output совпадает и не зависит от состояния interactive editor

#### Scenario: Public page использует immutable snapshot
- **WHEN** будущая public Next.js page отображает опубликованную версию документа
- **THEN** она читает заранее derived TipTap JSON и не декодирует mutable Yjs state при каждом request

### Requirement: Базовое редактирование документа

Система SHALL предоставлять editor surface с paragraph, headings уровней 1–3, bullet list, ordered list, task list/task item и marks bold, italic, strike, inline code и link. Поверхность SHALL быть плоской, без отдельной card surface.

#### Scenario: Пользователь форматирует документ
- **WHEN** пользователь вводит текст и применяет поддерживаемый block type или mark
- **THEN** editor отображает форматирование и записывает изменение в текущий `Y.Doc`

#### Scenario: История пуста
- **WHEN** для текущего клиента нет доступного undo или redo
- **THEN** history actions не отображаются как доступные

#### Scenario: История доступна
- **WHEN** локальное изменение можно отменить или повторить
- **THEN** поверхность показывает только доступные undo и redo actions

### Requirement: Контекстное форматирование и безопасные ссылки

Система SHALL показывать BubbleMenu только для непустого текстового выделения и SHALL позволять создавать, изменять и удалять normalized HTTP, HTTPS и mailto links. Адрес без scheme SHALL нормализоваться в HTTPS; запрещённая или некорректная scheme MUST NOT изменять документ. Внешняя ссылка с `target="_blank"` MUST получать `rel="noopener noreferrer"` при rendering.

#### Scenario: Пользователь выделяет текст
- **WHEN** пользователь создаёт непустое текстовое выделение
- **THEN** появляется контекстная панель с bold, italic, strike, inline code и link

#### Scenario: Пользователь редактирует ссылку
- **WHEN** курсор находится внутри link mark и пользователь открывает link form кнопкой или `Mod-K`
- **THEN** форма содержит текущий адрес и позволяет обновить либо удалить ссылку с восстановлением focus в editor

#### Scenario: Пользователь вводит небезопасный адрес
- **WHEN** пользователь пытается применить запрещённую или некорректную URI scheme
- **THEN** документ не изменяется, а форма показывает доступное сообщение об ошибке

#### Scenario: Renderer выводит внешнюю ссылку
- **WHEN** static или interactive renderer представляет validated HTTP(S) link в новой вкладке
- **THEN** output содержит безопасный `rel` и не доверяет произвольным persisted HTML attrs

### Requirement: URL-only external media имеют безопасный JSON contract

Система SHALL добавлять image, YouTube и direct video только по validated external URL без сохранения файлов, base64 media или arbitrary iframe HTML в `Y.Doc`. Image SHALL хранить normalized HTTPS `src`, `alt`/`decorative`, optional `caption`, `alignment` и `width`; YouTube SHALL хранить только normalized `videoId`, optional `caption`, `alignment` и `width`; direct video SHALL хранить normalized HTTPS `src`, optional `caption`, `alignment` и `width`.

#### Scenario: Пользователь добавляет изображение
- **WHEN** пользователь подтверждает HTTPS URL без credentials, непустой alt либо явный decorative flag и допустимые presentation attrs
- **THEN** editor вставляет image node со стабильными attrs, а renderer может вывести `figure`/`img`/optional `figcaption` без NodeView

#### Scenario: Пользователь добавляет YouTube video
- **WHEN** пользователь подтверждает URL allowlisted YouTube host с корректным video ID
- **THEN** документ сохраняет только video ID, а renderer самостоятельно создаёт privacy-enhanced embed `youtube-nocookie.com` без autoplay

#### Scenario: Пользователь добавляет direct video
- **WHEN** пользователь подтверждает HTTPS URL без credentials, pathname которого оканчивается на MP4 или WebM
- **THEN** editor вставляет video node, а renderer создаёт native video с controls, `preload="metadata"` и без autoplay

#### Scenario: Пользователь вводит небезопасный media URL
- **WHEN** URL использует запрещённый protocol, credentials, неподдерживаемый host, некорректный YouTube ID или неподдерживаемый video format
- **THEN** документ не изменяется, а форма показывает доступное сообщение об ошибке

#### Scenario: Внешний media URL недоступен
- **WHEN** browser не может загрузить сохранённый validated media URL
- **THEN** node сохраняется, а renderer показывает доступный deterministic fallback вместо удаления содержимого

### Requirement: Rendering external media ограничен security policy

Interactive и static rendering SHALL быть совместимы с CSP, ограничивающей `img-src` и `media-src` значениями `'self' https:`, `frame-src` значением `https://www.youtube-nocookie.com` и `object-src` значением `'none'`. Image/iframe SHALL применять установленную referrer policy, а YouTube iframe SHALL получать фиксированные безопасные attrs от renderer.

#### Scenario: Renderer представляет сохранённый YouTube node
- **WHEN** node содержит validated video ID
- **THEN** iframe создаётся только для privacy-enhanced allowlisted origin и не использует пользовательский iframe HTML или произвольные attrs

#### Scenario: Renderer представляет external image или video
- **WHEN** node содержит validated HTTPS source
- **THEN** output совместим с заданными `img-src`/`media-src` и referrer-policy constraints

### Requirement: Перестановка верхнеуровневых блоков доступна без pointer

Система SHALL позволять менять порядок поддерживаемых верхнеуровневых paragraph, heading, list и media blocks одной document transaction. Наряду с drag handle система MUST предоставлять keyboard-reachable actions `Move up` и `Move down`; вложенные list items MUST NOT получать самостоятельную top-level handle.

#### Scenario: Пользователь перетаскивает блок
- **WHEN** пользователь переносит поддерживаемый верхнеуровневый block drag handle в другую позицию
- **THEN** блок целиком перемещается в текущем `Y.Doc` одной transaction

#### Scenario: Пользователь перемещает блок с клавиатуры
- **WHEN** пользователь активирует доступное действие `Move up` или `Move down` без pointer
- **THEN** блок перемещается одной transaction, focus остаётся на перемещённом block, а недоступное направление отключено на границе документа

### Requirement: Slash menu имеет доступное keyboard-управление

Система SHALL предоставлять slash menu с поиском и управлением через ArrowUp, ArrowDown, Enter и Escape. После выполнения немедийной команды focus SHALL возвращаться в editor; при выборе media command focus SHALL переходить в первое поле media form.

#### Scenario: Открытие и выбор команды
- **WHEN** пользователь вводит `/` в допустимой позиции
- **THEN** появляется меню с paragraph, headings 1–3, bullet list, ordered list, task list, image, YouTube и video

#### Scenario: Команды фильтруются
- **WHEN** пользователь продолжает ввод после `/`
- **THEN** меню фильтрует команды и сообщает пустое состояние, если совпадений нет

#### Scenario: Открытие media form
- **WHEN** пользователь выбирает media command с клавиатуры
- **THEN** slash query удаляется, media form открывается, а focus находится в первом поле

### Requirement: Editor surface не зависит от transport

Система SHALL предоставлять editor surface готовый `Y.Doc` и presentation-состояние editable через document session. Surface MUST NOT определять источник документа, выполнять persistence или зависеть от REST/WebSocket lifecycle. Замена session adapter MUST сохранять schema, commands и surface behavior.

#### Scenario: Surface работает с fake session
- **WHEN** transport-neutral test session предоставляет готовый `Y.Doc`
- **THEN** editor поддерживает schema и editing flows без document API или WebSocket

#### Scenario: Transport меняется на Hocuspocus
- **WHEN** future composition заменяет REST session на Hocuspocus session с тем же contract
- **THEN** schema и editor surface не переписываются, а editable document не получает параллельный REST persistence lifecycle

### Requirement: Временный REST session не является production editing lifecycle

Временный REST session SHALL использовать полный Yjs state только для изолированного bootstrap/save contract и MUST NOT подключаться к production workspace, route или public widget entry point. Пока Hocuspocus не реализован, текущий workspace SHALL сохранять placeholder и MUST NOT выполнять document GET/PUT для editor. Silent last-write-wins между пользовательскими вкладками MUST NOT быть доступным production behavior.

#### Scenario: Пользователь открывает текущую production page route
- **WHEN** workspace отображает активную страницу до Hocuspocus integration
- **THEN** остаётся существующий placeholder, а REST document editing lifecycle не запускается

#### Scenario: REST session проверяется изолированно
- **WHEN** test harness создаёт REST session с generated API adapter
- **THEN** bootstrap/save contract проверяется без production import или route mounting

#### Scenario: Возникает запрос выпустить REST editor
- **WHEN** команда рассматривает production mounting до Hocuspocus
- **THEN** требуется новый reviewed single-writer design, а silent full-PUT overwrite не принимается как штатное поведение

### Requirement: Временный REST autosave последователен и ограничен payload limit

Изолированный REST session SHALL планировать save через 750 мс после последнего изменения, MUST NOT выполнять параллельные PUT одной session и SHALL отправлять последний dirty snapshot после завершения текущего request. Перед PUT session MUST проверять размер binary `Y.encodeStateAsUpdate` против API limit 1 MiB.

#### Scenario: Быстрая серия изменений
- **WHEN** документ получает несколько updates в пределах debounce interval
- **THEN** session формирует один последний полный snapshot

#### Scenario: Изменение во время сохранения
- **WHEN** update происходит до завершения текущего PUT
- **THEN** параллельный request не создаётся, а после текущего отправляется последний queued snapshot

#### Scenario: Ошибка сохранения
- **WHEN** PUT завершается ошибкой
- **THEN** session сохраняет dirty state, показывает безопасную typed error и допускает explicit retry

#### Scenario: Encoded document превышает API limit
- **WHEN** binary update больше 1 MiB до base64 conversion и PUT
- **THEN** PUT не выполняется, session переходит в persistent blocking state `document-too-large` и не повторяет бессмысленный autosave для того же oversized state

#### Scenario: Binary state преобразуется chunk-ами
- **WHEN** допустимый по размеру `Uint8Array` кодируется в base64
- **THEN** chunked conversion не переполняет argument stack и не трактуется как способ обойти API payload limit

### Requirement: Гарантии сохранения при уходе описаны честно

При SPA navigation или смене page session система SHALL выполнять только best-effort flush до destruction. При закрытии tab/browser система SHALL предупреждать через `beforeunload` при несохранённом или блокирующем state, но MUST NOT обещать завершение обычного async PUT и MUST NOT использовать keepalive полного Yjs payload как основную persistence guarantee.

#### Scenario: Пользователь переключает страницу в SPA
- **WHEN** текущий документ dirty и начинается page switch
- **THEN** session пытается выполнить best-effort flush перед cleanup без заявления durable guarantee

#### Scenario: Пользователь закрывает вкладку с dirty document
- **WHEN** browser допускает `beforeunload` warning
- **THEN** пользователь получает предупреждение о возможной потере данных, а warning не считается подтверждением сохранения

#### Scenario: Browser не завершает request при закрытии
- **WHEN** tab закрывается до завершения persistence request
- **THEN** система не сообщает документ как гарантированно сохранённый

### Requirement: Session cleanup предотвращает stale lifecycle

Система MUST очищать document session при смене `pageId`, unmount, aborted load и создании replacement session. Cleanup MUST отсоединять Y.Doc/editor listeners, timers, AbortController requests, pending lifecycle state, TipTap editor и временный `Y.Doc`; future Hocuspocus adapter MUST также очищать provider. Завершившиеся callbacks старой session MUST быть no-op для новой страницы.

#### Scenario: PageId меняется во время GET
- **WHEN** load предыдущей страницы завершается после создания новой session
- **THEN** старый response не применяется к новому `Y.Doc` и не изменяет её status/error

#### Scenario: PageId меняется во время PUT
- **WHEN** save предыдущей страницы завершается после page switch
- **THEN** callback не помечает новую страницу saved и не очищает её dirty state

#### Scenario: Surface и session уничтожаются
- **WHEN** editor unmount или replacement session запускает cleanup
- **THEN** listeners, timers, requests, lifecycle state, TipTap editor и принадлежащий session `Y.Doc` освобождаются идемпотентно, а отложенные callbacks не выполняют новых saves

### Requirement: Статусы и presentation read-only доступны пользователю

Система SHALL различать loading, ready, dirty, saving, saved, load error, save error, unsupported schema, document-too-large и read-only доступным текстом без raw backend details. Surface MUST NOT создаваться до успешной загрузки. При `editable=false` изменяющие controls MUST отсутствовать, но presentation flag MUST NOT считаться authorization boundary.

#### Scenario: Документ загружается
- **WHEN** session ещё не предоставила готовый `Y.Doc`
- **THEN** editor surface не рендерится, а loading state сообщает `aria-busy`

#### Scenario: Session сообщает сохранение или ошибку
- **WHEN** status меняется на saving/saved либо typed error
- **THEN** пользователь получает соответствующий live status или безопасный alert с допустимым retry

#### Scenario: Presentation read-only включён
- **WHEN** session или composition устанавливает `editable=false`
- **THEN** ввод, slash, history, reorder, link и media controls недоступны, содержимое читаемо, а server authorization по-прежнему обязателен в future integration
