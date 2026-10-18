## Purpose

Даёт backend-потребителям единое schema-aware представление captured Y.Doc: ProseMirror JSON и derived media references строятся из одной версии сохранённого документа без потери содержимого.

## ADDED Requirements

### Requirement: Проекция использует только captured state и его schema version

Document Projection MUST принимать captured Yjs bytes и соответствующую `tiptapSchemaVersion`, возвращать ProseMirror JSON, media references и применённую schema version. Она MUST NOT повторно захватывать документ, читать `PAGE_DOCUMENTS`, обращаться к Hocuspocus, БД, HTTP или storage, изменять исходное состояние либо создавать editor transaction. Одинаковые bytes и версия MUST давать эквивалентный результат.

#### Scenario: Пустой captured документ
- **WHEN** projection получает пустой Yjs state с поддерживаемой schema version
- **THEN** она возвращает `{ "type": "doc" }`, пустой список media references и указанную версию, сохраняя представление текущего frontend conversion, хотя этот результат не проходит ProseMirror `block+` validation

Будущие publication и SSR consumers MUST распознавать `{ "type": "doc" }` как пустой документ и MUST NOT трактовать его как повреждённое содержимое.

#### Scenario: Совместимость с rich frontend fixture
- **WHEN** captured state создан текущим frontend schema v1 и содержит текст с несколькими одновременными marks, link с attrs, соседние текстовые сегменты, вложенные list/task nodes и image, video, youtube nodes
- **THEN** JSON сохраняет текст, порядок и вложенность nodes, каждый mark и его attrs, а также attrs всех media nodes по persisted schema v1

#### Scenario: Изменение live документа после capture
- **GIVEN** состояние live Y.Doc было закодировано в captured bytes
- **WHEN** live Y.Doc меняется, а projection получает ранее captured bytes
- **THEN** результат отражает только captured state

#### Scenario: Повторная проекция одинаковых bytes
- **WHEN** projection несколько раз получает одинаковые bytes и schema version
- **THEN** все результаты эквивалентны и не содержат случайно сгенерированных значений

### Requirement: Projection fail closed при несовместимой схеме или риске потери содержимого

Projection MUST поддерживать только явно объявленные версии persisted schema. Она MUST явно отклонять неизвестные версии, повреждённые bytes и nodes, marks, attrs или структуры, которые текущая schema не поддерживает либо не может сохранить. Projection MUST NOT терять семантическое содержимое и MUST NOT возвращать частичный JSON. Representation-only нормализация без семантических изменений разрешена. Единственные разрешённые canonical transformations attrs — frontend-equivalent normalization persisted media attrs и нормализация `link.href` через `normalizePageDocumentLink()`.

#### Scenario: Неизвестная schema version
- **WHEN** projection получает версию, для которой нет поддерживаемой persisted schema
- **THEN** она возвращает явную ошибку версии без частичного результата

#### Scenario: Повреждённые Yjs bytes
- **WHEN** captured bytes невозможно декодировать
- **THEN** projection возвращает явную ошибку декодирования без частичного результата

#### Scenario: Неподдерживаемый node, mark или attr
- **WHEN** captured state содержит тип или атрибут, отсутствующий в schema указанной версии
- **THEN** projection возвращает явную ошибку несовместимого содержимого и сохраняет входные bytes

#### Scenario: Структура не проходит validation schema
- **WHEN** известные node types расположены или вложены способом, не допускаемым schema версии
- **THEN** projection возвращает явную ошибку schema validation вместо пропуска проблемного фрагмента

#### Scenario: Потеря содержимого при нормализации
- **WHEN** conversion теряет или изменяет node, текст, attr либо mark сверх явно заданной canonicalization persisted media attrs, `link.href` и representation-only нормализаций
- **THEN** projection возвращает явную ошибку schema validation и не выдаёт нормализованный JSON

#### Scenario: Семантически эквивалентная нормализация
- **WHEN** projection canonicalizes media attrs по действующим frontend validators и `link.href` через `normalizePageDocumentLink()`, а ProseMirror нормализация добавляет schema-default attrs, опускает пустой `content` или меняет только порядок marks при сохранении их набора и attrs
- **THEN** projection принимает результат как эквивалентный и возвращает полный нормализованный JSON

### Requirement: Schema v1 соответствует текущему persisted editor document

Schema version 1 MUST декодировать persisted nodes, marks, attrs и defaults текущей editor schema, включая текстовые документы, форматирование, списки, task nodes и текущие media nodes. Проверка совместимости MUST использовать один и тот же реальный versioned Yjs fixture в frontend и backend tests и проверять JSON representation, а также сохранность типов nodes, marks и attrs. Отдельная контрактная проверка MUST сравнивать реальную frontend ProseMirror schema с backend schema по nodes, marks, persisted attr names, attr defaults и schema version. UI-only extensions, не добавляющие nodes или marks в ProseMirror schema, MUST NOT считаться schema drift.

#### Scenario: Fixture текущей frontend schema
- **WHEN** одна versioned Yjs fixture schema v1 проверяется web и API test suites
- **THEN** текущая editor schema и backend projection дают эквивалентный ProseMirror JSON с теми же nodes, marks, mark attrs и node attrs, включая несколько simultaneous marks, link attrs, соседние text segments, вложенные task/list nodes и комбинацию image/video/youtube

#### Scenario: Изменение frontend schema обнаруживается без изменения fixture
- **WHEN** frontend добавляет или удаляет node/mark либо меняет имя/default persisted attr без согласованного изменения backend schema
- **THEN** контрактный compatibility test завершается ошибкой с указанием расхождения

#### Scenario: Yjs mark name с y-prosemirror hash suffix
- **WHEN** `Y.XmlText.toDelta()` содержит mark attribute key, совпадающий с `/(.*)(--[a-zA-Z0-9+/=]{8})$/`, для поддерживаемого mark
- **THEN** projection определяет исходное имя mark по соглашению y-prosemirror v1.3.7, сохраняет mark и все attrs, а последующая ProseMirror normalization не удаляет его

#### Scenario: Hash decoding создаёт конфликтующие marks
- **WHEN** разные Yjs mark keys после снятия suffix обозначают один ProseMirror mark type с несовместимыми attrs
- **THEN** projection возвращает явную schema error вместо молчаливого объединения или потери marks

#### Scenario: Изменение persisted schema
- **WHEN** frontend меняет persisted nodes, marks, attrs или defaults
- **THEN** projection совместима только после согласованного обновления backend schema, версии и fixture, подтверждённого compatibility tests

### Requirement: Persisted attrs проверяются по ограничениям schema v1

Projection MUST валидировать persisted attrs, ограничения которых не обеспечивает одна ProseMirror schema: `heading.level` MUST быть одним из `1`, `2`, `3`; `taskItem.checked` MUST быть boolean; `orderedList.type` MUST быть string или `null`; `link.href` MUST быть строкой, принимаемой frontend normalizer. Отсутствующий `orderedList.start` MUST использовать schema default `1`; заданный `start` MUST быть safe integer, включая отрицательные значения и ноль. Дробный, non-finite или выходящий за пределы safe integer `start` MUST завершаться typed schema error без частичного projection и MUST NOT заменяться default-ом.

`heading.level` MUST оставаться ограничен уровнями frontend `[1, 2, 3]`. Media `widthPercent` MUST нормализоваться существующим frontend правилом: `Number()` conversion, non-finite -> `100`, round, clamp `25..100`. В schema v1 нет других числовых persisted attrs. Эти проверки остаются конкретными, без универсального validation framework.

#### Scenario: Допустимый orderedList.start
- **WHEN** ordered list не содержит `start` либо содержит safe integer, включая `1`, `0`, `-2`, `Number.MIN_SAFE_INTEGER` или `Number.MAX_SAFE_INTEGER`
- **THEN** projection использует default `1` для отсутствующего attr и сохраняет заданное целое значение без ограничения знака

#### Scenario: Некорректный orderedList.start
- **WHEN** ordered list содержит строковый, дробный, другой нечисловой, non-finite или unsafe integer `start`
- **THEN** projection возвращает typed schema error и не возвращает частичный JSON или media references

#### Scenario: Некорректные прочие persisted attrs
- **WHEN** heading имеет level вне `1|2|3`, task item имеет неboolean `checked`, или link href имеет нестроковое/недопустимое значение
- **THEN** projection возвращает typed schema error без частичного результата

#### Scenario: Media widthPercent следует frontend normalization
- **WHEN** текущий frontend media validator принимает width после `Number()` conversion, non-finite fallback, округления и clamp
- **THEN** projection записывает то же нормализованное число в `contentJson`, а остальные media refs строятся согласованно с canonical attrs

### Requirement: Link href canonicalization повторяет текущий frontend normalizer

Projection MUST использовать правила `normalizePageDocumentLink()`: trim внешних whitespace; добавить `https://`, если scheme отсутствует; принять только `http:`, `https:` или `mailto:`; для HTTP(S) требовать hostname и отсутствие username/password; для mailto требовать непустой pathname. При успехе `contentJson` MUST содержать canonical `URL.href`, а не исходную строку. Другие transformations не допускаются. Недопустимая ссылка MUST приводить к typed schema error без частичного projection. Эта normalization явно разрешена semantic comparison для `link.href`. Canonicalization MUST NOT изменять captured Yjs bytes или исходный Y.Doc.

#### Scenario: Допустимая ссылка нормализуется в JSON
- **WHEN** link mark содержит ссылку, принимаемую `normalizePageDocumentLink()`, включая URL без scheme или внешние whitespace
- **THEN** `contentJson` содержит нормализованный `href`, эквивалентный frontend `URL.href`, а captured bytes остаются неизменными

#### Scenario: Недопустимая ссылка закрывает projection
- **WHEN** link mark имеет отсутствующий/нестроковый href, запрещённый scheme, HTTP(S) без hostname или URL с credentials
- **THEN** projection возвращает typed schema error и не возвращает частичный результат

### Requirement: Media references извлекаются из той же версии документа

Projection MUST проверять persisted attrs всех текущих media nodes (`image`, `video`, `youtube`) правилами, совместимыми с frontend validators. Каждый media node MUST иметь UUID `nodeId` и уникальный `nodeId` в рамках документа; повторяющийся или отсутствующий/невалидный ID MUST завершаться явной ошибкой. Общие `alignment`, `caption`, `widthPercent` MUST нормализоваться как на frontend и отражаться в projection `contentJson`: alignment из `start|center|end`, иначе `center`; caption trim с пустым значением как `null`; width преобразуется через `Number()`, non-finite значение становится 100, иначе округляется и clamp-ится до 25–100. Image attrs MUST проверять URL по persisted rules и записывать canonical URL в соответствующий `image` node внутри `contentJson`: input trim-ится, к URL без схемы добавляется `https://`, далее требуется HTTPS с hostname без credentials. Image `alt` trim-ится; `decorative` считается true только при точном `true`; decorative image требует пустой alt, обычный — непустой. Video `src` MUST проходить те же URL normalization и HTTPS rules, плюс иметь pathname с расширением `.mp4` или `.webm` без учёта регистра; нормализованный URL записывается в `contentJson`. Persisted YouTube `videoId` MUST совпадать с `^[A-Za-z0-9_-]{11}$`. Projection валидирует только сохранённый ID; разбор YouTube URL остаётся ответственностью frontend. Недопустимые attrs MUST приводить к явной ошибке без частичного результата. Media references MUST извлекаться только из image nodes того же captured state, что и JSON, и MUST строиться из тех же canonical attrs: `reference.nodeId` и `reference.url` равны `nodeId` и `src` соответствующего image node в итоговом `contentJson`. Каждое image occurrence MUST сохранять собственную reference; совпадение URL при разных `nodeId` не является основанием для deduplication. Video и YouTube attrs валидируются, но их media references пока не создаются. Media references MUST быть derived values и MUST NOT менять исходный persisted Y.Doc или captured bytes.

#### Scenario: Документ без image nodes
- **WHEN** schema v1 документ содержит только поддерживаемые текстовые/структурные nodes либо валидные video и youtube nodes
- **THEN** media references пусты, а video/youtube nodes и их attrs остаются в JSON

#### Scenario: Несколько одинаковых external URL
- **WHEN** два image nodes имеют одинаковый URL и разные валидные `nodeId`
- **THEN** projection возвращает две external references с соответствующими `nodeId`

#### Scenario: Повторяющийся media nodeId
- **WHEN** два media nodes одного документа имеют одинаковый `nodeId`, даже если их URLs или типы различаются
- **THEN** projection возвращает явную media validation error без частичного результата

#### Scenario: Отсутствующий или некорректный nodeId
- **WHEN** любой image, video или youtube node не имеет UUID `nodeId`
- **THEN** projection возвращает явную media validation error и не генерирует ID

#### Scenario: Некорректные persisted attrs каждого media node
- **WHEN** image имеет запрещённый URL или несовместимые `alt`/`decorative`, video имеет запрещённый URL либо неподдерживаемое расширение, или youtube имеет некорректный `videoId`
- **THEN** projection возвращает явную media validation error для соответствующего node и не возвращает частичный JSON или references

#### Scenario: Три media node types в одном fixture
- **WHEN** frontend-generated Yjs fixture содержит валидные image, video и youtube nodes с разными UUID и общими presentation attrs
- **THEN** projection сохраняет и проверяет все три node в content JSON, а `mediaReferences` содержит только reference image occurrence

### Requirement: Schema v1 сохраняет legacy external image contract

Для schema v1 projection MUST читать legacy `image.attrs.src` и строить из него `{ type: 'external', nodeId, url }`. Output JSON MUST сохранять legacy v1 shape, а attrs, принимаемые frontend persisted validator с нормализацией, MUST быть записаны в canonical form. Reference MUST использовать те же canonical `nodeId` и URL, что и JSON. Projection MUST NOT менять исходный Y.Doc или captured bytes. Поле `ImageSource` предусматривает discriminated union `{ type: 'external'; url } | { type: 'asset'; assetId }`, но internal asset reference MUST NOT считаться поддержанным persisted media source, пока соответствующая versioned schema не будет объявлена.

#### Scenario: Валидное legacy image
- **WHEN** schema v1 содержит image с валидными persisted attrs, UUID `nodeId` и допустимым внешним URL в `src`
- **THEN** JSON сохраняет v1 image shape с canonical attrs, а media references содержит external reference с теми же `nodeId` и URL, что и JSON

#### Scenario: Принятая frontend normalization согласована между JSON и reference
- **WHEN** image содержит принимаемый frontend validator URL без схемы и `widthPercent` вне диапазона
- **THEN** projection записывает HTTPS URL и clamped width в `contentJson`, reference использует тот же URL, а исходный Y.Doc и captured bytes остаются неизменными

#### Scenario: Несколько принятых media attrs нормализуются согласованно
- **WHEN** image содержит whitespace вокруг допустимого URL/caption/alt, допустимую non-canonical alignment и numeric width, которую frontend нормализует
- **THEN** все соответствующие canonical values отражены в `contentJson`, `mediaReferences` построены из canonical image attrs, а semantic comparison не классифицирует только эти предусмотренные изменения как потерю содержимого

#### Scenario: Internal asset schema ещё не объявлена
- **WHEN** schema v1 не содержит persisted contract для `assetId`
- **THEN** projection не интерпретирует произвольный assetId как поддержанную media reference и явно отклоняет неподдерживаемое содержимое

#### Scenario: Повторяющиеся media nodes
- **WHEN** документ содержит несколько image nodes с одним URL
- **THEN** каждый node остаётся отдельным в JSON и media references

### Requirement: External media URLs валидируются по persisted image rules

External image URL MUST проходить те же persisted image validation rules, что и текущий editor: trim, добавление `https://` при отсутствии схемы и HTTPS URL с hostname без username/password. Валидный нормализованный URL MUST попадать в `src` соответствующего image node внутри `contentJson` и в image reference. Явно заданные HTTP, `javascript:`, `data:`, `file:`, `blob:` и некорректные URL MUST приводить к явной media error. Те же общие HTTPS restrictions MUST применяться к video URL, дополнительно ограниченному `.mp4`/`.webm` pathname; его canonical value MUST отражаться в JSON. Persisted YouTube nodes MUST валидировать только сохранённый `videoId` по 11-character pattern; parsing URLs для получения ID выполняет frontend и не входит в Document Projection. Projection MUST NOT выполнять запросы к внешнему ресурсу, проверять его доступность или скачивать его. Результат MUST оставаться JSON data и MUST NOT считаться безопасным HTML.

#### Scenario: Небезопасный или недопустимый URL
- **WHEN** image содержит HTTP, опасную схему, credentials или невалидный URL
- **THEN** projection возвращает явную media validation error и не выдаёт недопустимый URL как reference

#### Scenario: Обработка HTTPS URL
- **WHEN** image содержит допустимый HTTPS URL и остальные persisted attrs валидны
- **THEN** projection локально формирует external reference без сетевого запроса

#### Scenario: Нормализация URL как на frontend
- **WHEN** image или video содержит URL без схемы, который frontend принимает, и остальные persisted attrs валидны
- **THEN** projection нормализует его с `https://` по persisted validation rules; canonical URL отражается в JSON, image reference использует этот же URL, а video дополнительно требует `.mp4` или `.webm` pathname

#### Scenario: Значение отклонено persisted media validator
- **WHEN** media attrs содержат запрещённый явный URL scheme, несовместимые `alt`/`decorative`, invalid `videoId` либо другую комбинацию attrs, которую frontend persisted validator отклоняет
- **THEN** projection возвращает media validation error без частичного `contentJson` или `mediaReferences`

#### Scenario: Внешний ресурс изменён или удалён
- **WHEN** владелец меняет или удаляет внешний ресурс после projection
- **THEN** сохранённая reference продолжает обозначать URL и не утверждает неизменность содержимого файла
