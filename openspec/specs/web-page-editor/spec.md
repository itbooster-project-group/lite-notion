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

### Requirement: Collaborative session preserves the editor document contract

Collaborative page editing MUST использовать существующий `PAGE_CONTENT_YJS_FIELD`, versioned editor schema и текущие Tiptap/Yjs extensions. Editor MUST NOT создавать REST-loaded TipTap JSON или другую authoritative mutable content copy.

#### Scenario: Collaborative document uses the canonical field
- **WHEN** synced Y.Doc передаётся в editor
- **THEN** editor читает content из `PAGE_CONTENT_YJS_FIELD`
- **AND** persisted changes остаются binary Yjs updates

#### Scenario: Reconnect does not replace document state
- **WHEN** provider reconnects после временного disconnect
- **THEN** editor продолжает использовать исходный Y.Doc
- **AND** document state не сбрасывается в пустой или REST snapshot

### Requirement: Uploaded images become stable asset-backed document nodes

The collaborative editor MUST upload and confirm an image asset is ready before inserting its image node into the Y.Doc. Each inserted node MUST contain a stable `nodeId`, stable `source: { type: 'asset', assetId }`, and schema-v2-compatible `alt` and `decorative` attributes; it MUST NOT contain a signed URL. A non-decorative image MUST have non-empty trimmed `alt`; a decorative image MUST have empty `alt`. The operation MUST respect the page's effective edit permission, prevent duplicate insertion from repeated activation, and preserve existing external image nodes and schema compatibility.

#### Scenario: Editor inserts an uploaded image
- **WHEN** an editor uploads a supported image and the API confirms it ready
- **THEN** the editor inserts one image node with stable `nodeId` and `assetId` using the existing asset source contract
- **AND** the node includes a compatible `alt`/`decorative` pair
- **AND** the document projection can derive the page asset reference

#### Scenario: User describes a non-decorative image
- **WHEN** the user leaves decorative mode off and submits an image with non-empty alt text
- **THEN** the inserted node has `decorative=false` and the trimmed non-empty `alt`

#### Scenario: User explicitly marks an image decorative
- **WHEN** the user explicitly selects decorative mode
- **THEN** the inserted node has `decorative=true` and empty `alt`
- **AND** decorative mode is never selected implicitly to bypass validation

#### Scenario: User submits an invalid accessibility attribute pair
- **WHEN** a non-decorative image has empty alt or a decorative image has non-empty alt
- **THEN** insertion is rejected and no image node is written to Y.Doc

#### Scenario: Upload fails before insertion
- **WHEN** upload or ready confirmation fails
- **THEN** no asset-backed image node is written to Y.Doc
- **AND** the editor offers a safe retry or file reselection state

#### Scenario: User activates insertion twice
- **WHEN** a user double-clicks or repeats the insert action while one upload is active
- **THEN** the UI does not create duplicate uploads or image nodes for that action

#### Scenario: Two collaborators observe a new image
- **WHEN** one editor inserts a ready asset-backed image into the shared document
- **THEN** another connected collaborator observes the same stable node and asset identity through Yjs synchronization

#### Scenario: Existing external image is loaded
- **WHEN** a document contains a legacy external image node
- **THEN** the editor continues to render and preserve it without rewriting it as an asset-backed node

#### Scenario: New page upload receives its grant during initiation
- **WHEN** a new image upload is initiated with the target `pageId`
- **THEN** the client waits for the existing upload and ready confirmation and uses the grant created by backend initiation
- **AND** it does not call the grant endpoint again for that page

#### Scenario: Existing ready asset is attached to another page
- **WHEN** the uploader reuses an existing ready asset in a different target page
- **THEN** the client calls the existing page grant operation and waits for success before inserting the node
- **AND** it does not maintain a parallel client-side grant registry
- **AND** a denied grant leaves Y.Doc unchanged

#### Scenario: Another editor reuses an asset with an existing grant
- **WHEN** a different page editor inserts an asset already granted to the target page
- **THEN** the editor uses the existing grant and does not attempt to create a grant as another user's uploader

#### Scenario: Another editor has no grant for the asset
- **WHEN** a different page editor tries to reuse an asset without a target-page grant
- **THEN** insertion is rejected and Y.Doc remains unchanged



### Requirement: Asset image presentation survives reload and reconnect

An asset-backed image MUST be rehydrated from its stable asset identity after reload or collaboration reconnect. Refreshing a signed URL or rendering an unavailable state MUST NOT create a Y.Doc transaction. An unavailable read MUST NOT change the page's editability or mutate/remove the node. A user with current page edit permission MUST retain ordinary document operations on that node, including deletion; when page edit permission is actually lost, content mutations MUST stop according to backend authorization.

#### Scenario: Document reloads with an asset image
- **WHEN** a page reload restores an asset-backed image from Y.Doc
- **THEN** the editor resolves a fresh read URL for the current page context and renders the image
- **AND** it does not persist that URL into Y.Doc

#### Scenario: Collaboration reconnects
- **WHEN** the editor reconnects and resynchronizes an image node
- **THEN** it reuses the synchronized node and asset identities and refreshes presentation independently
- **AND** it does not insert a duplicate node

#### Scenario: Read permission is lost
- **WHEN** backend denies the image read after page permission is revoked
- **THEN** the image uses a safe unavailable placeholder
- **AND** read failure alone does not disable the rest of the page editor or the authorized editor's ability to remove the node

#### Scenario: Asset is missing or deleted
- **WHEN** a referenced asset cannot be resolved as readable and ready
- **THEN** the editor renders an accessible placeholder without a broken-image icon
- **AND** it leaves document content unchanged until an authorized user deliberately edits it

#### Scenario: Authorized editor removes an unavailable image
- **GIVEN** the user retains effective page edit permission
- **WHEN** the user deliberately removes an image node whose asset read URL is unavailable
- **THEN** the node is removed through the ordinary Y.Doc edit flow

#### Scenario: Page edit permission is revoked
- **WHEN** the user's effective page edit permission is revoked
- **THEN** content mutation controls are disabled and backend authorization rejects further document writes
- **AND** the node is not automatically removed because of the permission change

#### Scenario: Projection has not caught up with a synchronized image
- **WHEN** a viewer resolves an image before `PAGE_ASSETS` projection reaches the current document revision
- **THEN** the image remains in Y.Doc and the viewer sees the safe unavailable fallback for the denied read
- **AND** the client does not duplicate the node or retry the indistinguishable permission-denied response automatically
- **AND** after projection converges, a subsequent authorized resolution can display the image
