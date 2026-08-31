## Purpose

Определяет versioned persisted contract содержимого страницы, transport-neutral editor core, доступные editing flows и безопасное представление schema v1 в интерактивном и будущем статическом renderer.

## ADDED Requirements

### Requirement: Schema metadata, Yjs и collaboration field образуют editable persisted contract

Система MUST использовать `Y.Doc` как единственный authoritative mutable state. Система MUST NOT создавать authoritative TipTap JSON, block CRUD или вторую mutable-копию content в TanStack Query. Версия TipTap/ProseMirror schema MUST храниться отдельно в `PAGE_DOCUMENTS.tiptap_schema_version` рядом с `PAGE_DOCUMENTS.yjs_state`; `Y.Doc` сам по себе MUST NOT считаться носителем schema version. Schema v1 MUST использовать `PAGE_CONTENT_YJS_FIELD` со стабильным значением `default` как canonical имя `Y.XmlFragment`/TipTap Collaboration `field`; стандартный history extension MUST быть отключён при Collaboration/Yjs.

#### Scenario: Editor открывает document schema v1
- **WHEN** session получает `PAGE_DOCUMENTS.tiptap_schema_version = 1` и успешно декодированный `PAGE_DOCUMENTS.yjs_state`
- **THEN** он читает ProseMirror content из `PAGE_CONTENT_YJS_FIELD`, а не из неявного или произвольного Yjs field

#### Scenario: Conversion готовит derived JSON
- **WHEN** conversion utility, static-render preparation или publication pipeline читает document schema v1
- **THEN** она использует то же значение `PAGE_CONTENT_YJS_FIELD`, что и interactive editor

#### Scenario: Пользователь изменяет документ
- **WHEN** editor command изменяет content
- **THEN** изменение записывается в текущий `Y.Doc`, а отдельная authoritative JSON- или Query-копия не создаётся

#### Scenario: Пользователь отменяет локальное изменение
- **WHEN** для текущего клиента доступно undo или redo
- **THEN** операция выполняется history mechanism, совместимым с Yjs collaboration model, без competing standard history stack

#### Scenario: Empty Yjs document не содержит materialized content root
- **WHEN** пустой `Y.Doc` получает `PAGE_CONTENT_YJS_FIELD`, кодируется через `Y.encodeStateAsUpdate`, применяется к новому `Y.Doc`, а затем новый документ запрашивает тот же fragment
- **THEN** `getXmlFragment(PAGE_CONTENT_YJS_FIELD)` возвращает корректный пустой content root, а session допускает valid empty editor document

### Requirement: Schema version 1 является static-renderable persisted contract

Schema v1 MUST фиксировать nodes/marks document, text, paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold, italic, strike, inline code, link, image, YouTube и direct video. Names, attrs, defaults, metadata `tiptap_schema_version = 1` и `collaborationField = default` MUST быть стабильными для persisted Yjs state и derived publication JSON. Каждый custom node/mark MUST иметь deterministic non-editor representation; React NodeView MUST NOT быть единственным renderer. Добавление, удаление или переименование persisted node/mark, изменение persisted attrs, их semantics/defaults либо `PAGE_CONTENT_YJS_FIELD` MUST требовать новой schema version или явной compatibility migration; новый TipTap type MUST NOT считаться автоматически backward-compatible.

#### Scenario: Документ использует поддерживаемую schema
- **WHEN** session получает поддерживаемую metadata schema version и successfully decoded Yjs state
- **THEN** editor, conversion и static renderer используют один contract nodes, marks, attrs, defaults и collaboration field

#### Scenario: Одинаковый snapshot рендерится повторно
- **WHEN** static renderer дважды получает одинаковый versioned derived JSON
- **THEN** структурный HTML/React output совпадает и не зависит от состояния interactive editor или React NodeView

#### Scenario: Document не проходит admission validation
- **WHEN** session получает неподдерживаемую metadata schema version, incompatible document metadata или повреждённый/недекодируемый encoded Yjs state
- **THEN** система показывает безопасную blocking error, не создаёт editable surface и не заменяет state пустым document

### Requirement: Custom media nodes имеют stable IDs и нормализованную ширину

Image, YouTube и direct video MUST хранить opaque `nodeId`, сгенерированный при создании node и сохранённый в TipTap/ProseMirror attrs и Yjs state. `nodeId` MUST сохраняться при обычном edit, resize, alignment и move, быть доступным static renderer/publication pipeline и deconflict-иться с новым ID при explicit clone, paste или import. Custom media nodes MUST хранить `widthPercent` как integer 25–100, означающий процент ширины content/editor area; CSS strings и pixel values MUST NOT сохраняться.

#### Scenario: Пользователь создаёт media node
- **WHEN** пользователь вставляет image, YouTube или direct video
- **THEN** node получает новый stable `nodeId`, который сохраняется в document и доступен renderer

#### Scenario: Пользователь редактирует media node
- **WHEN** пользователь меняет caption, alignment, widthPercent или позицию существующего media node
- **THEN** его `nodeId` не меняется, а `widthPercent` остаётся normalised integer в диапазоне 25–100

#### Scenario: Пользователь клонирует или вставляет media node
- **WHEN** операция создаёт второй экземпляр существующего custom media node
- **THEN** новый экземпляр получает deconflicted `nodeId`, не совпадающий с исходным

#### Scenario: Renderer представляет ширину media node
- **WHEN** interactive или static renderer получает valid `widthPercent`
- **THEN** оба renderer интерпретируют значение как одинаковый процент ширины content/editor area

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

Система SHALL показывать BubbleMenu только для непустого текстового выделения и SHALL позволять создавать, изменять и удалять normalized HTTP, HTTPS и mailto links. Адрес без scheme SHALL нормализоваться в HTTPS; запрещённая или некорректная scheme MUST NOT изменять document. Внешняя ссылка с target blank MUST получать `rel='noopener noreferrer'` при rendering.

#### Scenario: Пользователь выделяет текст
- **WHEN** пользователь создаёт непустое текстовое выделение
- **THEN** появляется контекстная панель с bold, italic, strike, inline code и link

#### Scenario: Пользователь редактирует ссылку
- **WHEN** курсор находится внутри link mark и пользователь открывает link form кнопкой или `Mod-K`
- **THEN** форма содержит текущий адрес и позволяет обновить либо удалить ссылку с восстановлением focus в editor

#### Scenario: Пользователь вводит небезопасный адрес
- **WHEN** пользователь пытается применить запрещённую или некорректную URI scheme
- **THEN** document не изменяется, а форма показывает доступное сообщение об ошибке

#### Scenario: Renderer выводит внешнюю ссылку
- **WHEN** static или interactive renderer представляет validated HTTP(S) link в новой вкладке
- **THEN** output содержит безопасный `rel` и не доверяет произвольным persisted HTML attrs

### Requirement: URL-only external media имеют безопасный JSON contract

Система SHALL добавлять image, YouTube и direct video только по validated external URL без сохранения файлов, base64 media или arbitrary iframe HTML в `Y.Doc`. Image SHALL хранить `nodeId`, normalized HTTPS `src`, `alt`/`decorative`, optional `caption`, `alignment` и `widthPercent`; YouTube SHALL хранить `nodeId`, normalized `videoId`, optional `caption`, `alignment` и `widthPercent`; direct video SHALL хранить `nodeId`, normalized HTTPS `src`, optional `caption`, `alignment` и `widthPercent`.

#### Scenario: Пользователь добавляет изображение
- **WHEN** пользователь подтверждает HTTPS URL без credentials, непустой alt либо явный decorative flag и допустимые presentation attrs
- **THEN** editor вставляет image node со стабильными attrs, а renderer может вывести `figure`/`img`/optional `figcaption` без NodeView

#### Scenario: Пользователь добавляет YouTube video
- **WHEN** пользователь подтверждает URL allowlisted YouTube host с корректным video ID
- **THEN** document сохраняет только video ID, а renderer самостоятельно создаёт privacy-enhanced embed `youtube-nocookie.com` без autoplay

#### Scenario: Пользователь добавляет direct video
- **WHEN** пользователь подтверждает HTTPS URL без credentials, pathname которого оканчивается на MP4 или WebM
- **THEN** editor вставляет video node, а renderer создаёт native video с controls, preload metadata и без autoplay

#### Scenario: Пользователь вводит небезопасный media URL
- **WHEN** URL использует запрещённый protocol, credentials, неподдерживаемый host, некорректный YouTube ID или неподдерживаемый video format
- **THEN** document не изменяется, а форма показывает доступное сообщение об ошибке

#### Scenario: Внешний media URL недоступен
- **WHEN** browser не может загрузить сохранённый validated media URL
- **THEN** node сохраняется, а renderer показывает доступный deterministic fallback вместо удаления content

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
- **THEN** block целиком перемещается в текущем `Y.Doc` одной transaction

#### Scenario: Пользователь перемещает блок с клавиатуры
- **WHEN** пользователь активирует доступное действие `Move up` или `Move down` без pointer
- **THEN** block перемещается одной transaction, focus остаётся на перемещённом block, а недоступное направление отключено на границе document

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

### Requirement: Editor surface зависит только от minimal session contract

Система SHALL передавать editor surface только ready `Y.Doc` и presentation `editable` из `PageDocumentSession`. Базовая session MUST ограничиваться status `loading`, `ready` или `error`, error и lifecycle `destroy`; `ready` MUST означать, что metadata schema version валидирована, Yjs state успешно декодирован и document допущен к editing. Surface MUST NOT самостоятельно проверять database schema version либо определять transport, persistence, REST save state или Hocuspocus connection/sync state.

#### Scenario: Surface работает с in-memory session
- **WHEN** InMemory/Fake session предоставляет ready `Y.Doc`
- **THEN** editor поддерживает schema и editing flows без document API, WebSocket или persistence

#### Scenario: Future transport заменяет composition
- **WHEN** future Hocuspocus adapter предоставляет тот же ready doc/editable boundary
- **THEN** schema и `PageEditorSurface` не требуют rewrite, а connection/sync diagnostics остаются contract будущего adapter

#### Scenario: Session уничтожается или заменяется
- **WHEN** page identity меняется, editor unmount или composition создаёт replacement session
- **THEN** listeners, local UI timers, TipTap editor и принадлежащий session temporary `Y.Doc` очищаются, а callback уничтоженной session не меняет replacement session

### Requirement: Статусы и presentation read-only доступны пользователю

Система SHALL различать loading, ready и error доступным текстом без raw backend details. Surface MUST NOT создаваться до ready document. При `editable=false` изменяющие controls MUST отсутствовать, но presentation flag MUST NOT считаться authorization boundary.

#### Scenario: Документ подготавливается
- **WHEN** session ещё не предоставила ready `Y.Doc`
- **THEN** editor surface не рендерится, а loading state сообщает `aria-busy`

#### Scenario: Session сообщает ошибку
- **WHEN** session переходит в error
- **THEN** пользователь получает безопасный alert; composition может создать replacement session для повторной попытки

#### Scenario: Presentation read-only включён
- **WHEN** session или composition устанавливает `editable=false`
- **THEN** ввод, slash, history, reorder, link и media controls недоступны, content читаемо, а server authorization по-прежнему обязателен в future integration
