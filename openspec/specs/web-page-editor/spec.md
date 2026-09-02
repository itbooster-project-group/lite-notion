# web-page-editor Specification

## Purpose

Определяет versioned persisted contract содержимого страницы, transport-neutral editor core, доступные editing flows и безопасное представление schema v1 в интерактивном и будущем статическом renderer.

## Requirements

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

Schema v1 MUST фиксировать nodes/marks document, text, paragraph, headings 1–3, bullet/ordered lists, task list/task item, hard break, bold, italic, strike, inline code, link, image, YouTube и direct video. Names, attrs, defaults, metadata `tiptap_schema_version = 1` и `collaborationField = default` MUST быть стабильными для persisted Yjs state и derived publication JSON. Каждый custom node/mark MUST иметь deterministic non-editor representation; React NodeView MUST NOT быть единственным renderer. Все public static render/render-normalization entry points MUST получать schema version вместе с derived JSON и MUST явно отклонять unsupported version до normalization; version-specific normalization helpers MUST оставаться internal implementation details. Молчаливое удаление неизвестных nodes будущей schema MUST NOT считаться compatibility strategy. Добавление, удаление или переименование persisted node/mark, изменение persisted attrs, их semantics/defaults либо `PAGE_CONTENT_YJS_FIELD` MUST требовать новой schema version или явной compatibility migration; новый TipTap type MUST NOT считаться автоматически backward-compatible.

#### Scenario: Документ использует поддерживаемую schema
- **WHEN** session получает поддерживаемую metadata schema version и successfully decoded Yjs state
- **THEN** editor, conversion и static renderer используют один contract nodes, marks, attrs, defaults и collaboration field

#### Scenario: Одинаковый snapshot рендерится повторно
- **WHEN** static renderer дважды получает одинаковый versioned derived JSON
- **THEN** структурный HTML/React output совпадает и не зависит от состояния interactive editor или React NodeView

#### Scenario: Static renderer получает неподдерживаемую schema version
- **WHEN** static rendering boundary получает derived JSON с неизвестной `schemaVersion`
- **THEN** renderer выбрасывает явную typed error до normalization и не создаёт частичный HTML с молча удалёнными future nodes

#### Scenario: Document не проходит admission validation
- **WHEN** session получает неподдерживаемую metadata schema version, incompatible document metadata или повреждённый/недекодируемый encoded Yjs state
- **THEN** система показывает безопасную blocking error, не создаёт editable surface и не заменяет state пустым document

### Requirement: Custom media nodes имеют stable IDs и нормализованную ширину

Image, YouTube и direct video MUST хранить opaque `nodeId`, сгенерированный при создании node и сохранённый в TipTap/ProseMirror attrs и Yjs state. `nodeId` MUST сохраняться при обычном edit, resize, alignment и move, быть доступным static renderer/publication pipeline и deconflict-иться с новым ID при explicit clone, native clipboard paste или import. Clipboard deconflict MUST проверять uniqueness относительно текущего document и остальных media nodes вставляемого slice через тот же low-level contract, что и программная insertion. Custom media nodes MUST хранить `widthPercent` как integer 25–100, означающий процент ширины content/editor area; CSS strings и pixel values MUST NOT сохраняться.

#### Scenario: Пользователь создаёт media node
- **WHEN** пользователь вставляет image, YouTube или direct video
- **THEN** node получает новый stable `nodeId`, который сохраняется в document и доступен renderer

#### Scenario: Пользователь редактирует media node
- **WHEN** пользователь меняет caption, alignment, widthPercent или позицию существующего media node
- **THEN** его `nodeId` не меняется, а `widthPercent` остаётся normalised integer в диапазоне 25–100

#### Scenario: Пользователь клонирует или вставляет media node
- **WHEN** операция создаёт второй экземпляр существующего custom media node
- **THEN** новый экземпляр получает deconflicted `nodeId`, не совпадающий с исходным

#### Scenario: Clipboard slice содержит повторяющиеся media IDs
- **WHEN** пользователь вставляет через ProseMirror clipboard pipeline несколько media nodes с одинаковым `nodeId`
- **THEN** каждый вставленный node получает ID, уникальный относительно текущего document и других nodes этого slice, сохраняя остальные attrs, content и marks

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

Система SHALL показывать BubbleMenu только для непустого текстового выделения и SHALL позволять создавать, изменять и удалять normalized HTTP, HTTPS и mailto links. Адрес без scheme SHALL нормализоваться в HTTPS; запрещённая или некорректная scheme MUST NOT изменять document. Внешняя ссылка с target blank MUST получать `rel='noopener noreferrer'` при rendering. Пока link form открыта, выделение MUST храниться как Yjs RelativePosition, привязанная к текущему shared fragment, а не как неподвижные числовые ProseMirror coordinates. Relative selection MUST разрешаться заново перед command и MUST NOT применяться к replacement document или случайному диапазону при невозможности разрешения.

#### Scenario: Пользователь выделяет текст
- **WHEN** пользователь создаёт непустое текстовое выделение
- **THEN** появляется контекстная панель с bold, italic, strike, inline code и link

#### Scenario: Пользователь редактирует ссылку
- **WHEN** курсор находится внутри link mark и пользователь открывает link form кнопкой или `Mod-K`
- **THEN** форма содержит текущий адрес и позволяет обновить либо удалить ссылку с восстановлением focus в editor

#### Scenario: Пользователь вводит небезопасный адрес
- **WHEN** пользователь пытается применить запрещённую или некорректную URI scheme
- **THEN** document не изменяется, а форма показывает доступное сообщение об ошибке

#### Scenario: Collaborator вставляет текст перед сохранённым выделением
- **WHEN** пользователь открыл link form для слова, а другой editor вставил текст перед этим словом в общем Y.Doc
- **THEN** link mark применяется к исходному логическому слову через заново разрешённую RelativePosition, а не к вставленному или соседнему диапазону

#### Scenario: Сохранённое выделение больше не разрешается
- **WHEN** link form закрыта, editor document заменён либо RelativePosition не принадлежит текущему Y.Doc/fragment
- **THEN** сохранённое выделение очищается или операция безопасно отклоняется без изменения случайного диапазона

#### Scenario: Renderer выводит внешнюю ссылку
- **WHEN** static или interactive renderer представляет validated HTTP(S) link в новой вкладке
- **THEN** output содержит безопасный `rel` и не доверяет произвольным persisted HTML attrs

#### Scenario: Renderer выводит email-ссылку
- **WHEN** static или interactive renderer представляет validated `mailto:` link
- **THEN** output сохраняет normalized `href` без обязательных `target='_blank'` и `rel='noopener noreferrer'`

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

#### Scenario: Renderer не знает runtime availability external media
- **WHEN** static renderer получает сохранённый validated media node без network probing
- **THEN** он выдаёт deterministic valid markup с доступными alt/title/caption и source metadata, не обещая обнаружить HTTP/network error; runtime error UI остаётся будущему public renderer

#### Scenario: Persisted content не проходил текущую UI validation
- **WHEN** static/public rendering boundary получает derived TipTap JSON со старыми, изменёнными или импортированными media/link attrs
- **THEN** boundary повторно нормализует `src`, `videoId`, `alignment`, `widthPercent`, `nodeId` и `href`, а невалидные external media fail-safe не рендерятся и не инициируют network request

#### Scenario: Renderer применяет alignment media
- **WHEN** valid media node имеет `alignment=start`, `center` или `end` вместе с `widthPercent`
- **THEN** interactive и deterministic static markup выравнивают figure по inline start, center или inline end через logical margin semantics

### Requirement: Rendering external media ограничен security policy

Interactive и static rendering SHALL быть совместимы с CSP, ограничивающей `img-src` и `media-src` значениями `'self' https:`, `frame-src` значением `https://www.youtube-nocookie.com` и `object-src` значением `'none'`. Эта page-document policy MUST применяться только к routes, представляющим editor/public document media, а не глобально ко всему приложению. Image/iframe SHALL применять установленную referrer policy, а YouTube iframe SHALL получать фиксированные безопасные attrs от renderer. Текущая policy намеренно разрешает прямые browser requests к произвольным HTTPS origins; `no-referrer` не скрывает IP/network request от external origin. До production private documents MUST быть отдельно оценены asset proxy/controlled storage либо более строгий allowlist.

#### Scenario: Renderer представляет сохранённый YouTube node
- **WHEN** node содержит validated video ID
- **THEN** iframe создаётся только для privacy-enhanced allowlisted origin и не использует пользовательский iframe HTML или произвольные attrs

#### Scenario: Renderer представляет external image или video
- **WHEN** node содержит validated HTTPS source
- **THEN** output совместим с заданными `img-src`/`media-src` и referrer-policy constraints

### Requirement: Перестановка верхнеуровневых блоков доступна без pointer

Система SHALL позволять менять порядок поддерживаемых верхнеуровневых paragraph, heading, list и media blocks одной document transaction. Наряду с drag handle система MUST предоставлять keyboard-reachable actions `Move up` и `Move down`, которые становятся визуально доступными при keyboard focus и имеют заметный focus indicator; вложенные list items MUST NOT получать самостоятельную top-level handle.

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

Создавший `PageDocumentSession` caller/hook/factory MUST владеть её lifecycle и вызывать `destroy()`; `PageEditor`, получивший session через props, MUST NOT уничтожать внешний resource. Editor instance, созданный TipTap `useEditor`, MUST использовать встроенный Strict Mode-safe lifecycle без ручного `editor.destroy()` в surface effect.

`createInMemoryPageDocumentSession({ doc })` MUST немедленно принимать exclusive ownership переданного `Y.Doc`, включая admission error: caller после передачи MUST управлять ресурсом только через `session.destroy()` и MUST NOT повторно использовать или отдельно уничтожать переданный doc. При смене admitted `doc`/editor identity surface MUST явно закрывать document-specific dialogs и сбрасывать bubble/slash state, popup coordinates, сохранённые selections/bookmarks и handler refs без сброса unrelated global UI. Весь interactive subtree — `EditorContent`, toolbar, block reorder и document-specific overlays — MUST рендериться только для editor instance, чья creation identity совпадает с текущим `Y.Doc`; между replacement doc и созданием соответствующего editor surface MUST показывать безопасное non-interactive transition state.

#### Scenario: Surface работает с in-memory session
- **WHEN** InMemory/Fake session предоставляет ready `Y.Doc`
- **THEN** editor поддерживает schema и editing flows без document API, WebSocket или persistence

#### Scenario: Future transport заменяет composition
- **WHEN** future Hocuspocus adapter предоставляет тот же ready doc/editable boundary
- **THEN** schema и `PageEditorSurface` не требуют rewrite, а connection/sync diagnostics остаются contract будущего adapter

#### Scenario: Session уничтожается или заменяется владельцем
- **WHEN** page identity меняется, owner unmount или composition создаёт replacement session
- **THEN** owner вызывает идемпотентный session cleanup после отсоединения surface, а `PageEditor` не уничтожает переданный session во время React Strict Mode effect replay

#### Scenario: Ready document заменяется при открытой форме
- **WHEN** LinkForm или media form открыта для page A и composition передаёт ready Y.Doc page B
- **THEN** document-specific dialogs, menus, coordinates и stored selections page A очищаются до дальнейшего взаимодействия с page B

#### Scenario: useEditor ещё возвращает instance предыдущего документа
- **WHEN** props уже содержат Y.Doc page B, а lifecycle `useEditor` кратковременно возвращает editor instance page A
- **THEN** content page A, toolbar, reorder controls, input и overlays не рендерятся и не принимают commands; после создания editor page B interactive subtree становится доступным только для page B

#### Scenario: Документы быстро заменяются A → B → C
- **WHEN** editor page B создаётся или завершает lifecycle после того, как текущим уже стал Y.Doc page C
- **THEN** identity guard не допускает editor B в interactive subtree и поверхность показывает только transition state либо editor page C

### Requirement: Floating editor menus отслеживают viewport и container layout

Bubble и slash menus с `position: fixed` MUST использовать общий positioning lifecycle. Position MUST пересчитываться после editor transaction/selection update, window resize, window или container scroll и наблюдаемого layout resize; частые события одного animation frame SHALL объединяться в один layout recalculation; listeners/observers MUST очищаться при replacement editor/unmount. Positioning SHALL выполнять viewport shift/clipping и flip там, где preferred placement не помещается.

#### Scenario: Контейнер редактора прокручивается
- **WHEN** bubble или slash menu открыта и window либо scroll container меняет viewport coordinates editor anchor
- **THEN** popup получает пересчитанные coordinates и не остаётся на прежней позиции

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
