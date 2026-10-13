## Purpose

Даёт backend-потребителям единое представление captured Y.Doc, интерпретированное по версии TipTap schema. Содержимое JSON и media references формируются из одних и тех же захваченных bytes и остаются derived representation, а не источником истины.

## ADDED Requirements

### Requirement: Проекция строится только из captured state и schema version

Document Projection MUST принимать Yjs bytes и соответствующую им `tiptapSchemaVersion`, MUST возвращать ProseMirror JSON, media references и применённую schema version. Projection MUST NOT выполнять capture, обращаться к Hocuspocus, HTTP, БД или изменять входной Y.Doc/state. Одинаковые bytes и версия schema MUST давать эквивалентный результат.

#### Scenario: Проекция пустого captured документа
- **WHEN** projection получает пустой Yjs state с поддерживаемой schema version
- **THEN** она возвращает пустой ProseMirror document и пустой список media references

#### Scenario: Проекция обычного документа
- **WHEN** projection получает captured документ с несколькими параграфами, форматированием и вложенными поддерживаемыми nodes
- **THEN** JSON сохраняет текст, marks, порядок и вложенность, а media references соответствуют тем же nodes

#### Scenario: Повторная проекция тех же bytes
- **WHEN** projection вызывается с одинаковыми Yjs bytes и schema version несколько раз
- **THEN** результаты эквивалентны и не содержат случайно сгенерированных значений

#### Scenario: Изменение live документа после capture
- **GIVEN** состояние Y.Doc было закодировано в captured bytes
- **WHEN** исходный live Y.Doc меняется после кодирования и projection получает ранее captured bytes
- **THEN** результат отражает captured состояние и не включает последующие изменения

### Requirement: Проекция явно отклоняет неизвестную или некорректную схему документа

Projection MUST использовать schema, соответствующую входному `tiptapSchemaVersion`. Неизвестная версия, некорректные Yjs bytes или неподдерживаемый node type MUST приводить к явной ошибке. Projection MUST NOT молча удалять или терять содержимое документа.

#### Scenario: Неизвестная schema version
- **WHEN** projection получает версию, для которой нет поддерживаемой schema
- **THEN** она возвращает явную ошибку несовместимой версии и не выдаёт частичный JSON

#### Scenario: Повреждённые Yjs bytes
- **WHEN** projection не может декодировать captured bytes
- **THEN** она возвращает явную ошибку декодирования и не выдаёт частичный JSON

#### Scenario: Неподдерживаемый node type
- **WHEN** captured state содержит node type, не поддерживаемый schema указанной версии
- **THEN** projection возвращает явную ошибку неподдерживаемого содержимого вместо удаления node

### Requirement: Проекция извлекает media references из тех же image nodes, что и JSON

Для каждого поддерживаемого image node projection MUST возвращать media reference с `nodeId` и discriminated source `external` либо `asset`. Legacy image node schema v1 с `attrs.src` MUST преобразовываться в external reference без изменения JSON или Y.Doc. Будущая schema MUST использовать общий source contract `{ type: 'external', url } | { type: 'asset', assetId }`. Projection MUST сохранять отдельную reference для каждого вхождения, даже если URL или assetId совпадают.

#### Scenario: Legacy external image
- **WHEN** schema v1 содержит image node с валидными `nodeId` и HTTPS `src`
- **THEN** JSON сохраняет legacy attrs, а projection возвращает external reference с теми же `nodeId` и URL

#### Scenario: Внутренний asset по согласованному будущему контракту
- **WHEN** image source задан как `{ type: 'asset', assetId }` и node содержит валидный `nodeId`
- **THEN** projection возвращает asset reference без URL, signed URL или обращения к storage

#### Scenario: Два вхождения одного источника
- **WHEN** два image nodes используют одинаковый URL или assetId, но разные nodeId
- **THEN** projection возвращает две отдельные references с соответствующими nodeId

#### Scenario: Документ без изображений
- **WHEN** документ содержит только текстовые nodes и marks
- **THEN** список media references пуст

#### Scenario: Отсутствующий или некорректный nodeId
- **WHEN** image node не имеет валидного nodeId
- **THEN** projection возвращает явную ошибку media mapping и не генерирует случайный ID

### Requirement: External media URL проходит безопасную локальную проверку

External image references MUST принимать только абсолютные HTTPS URLs без username/password. Схемы `http:`, `javascript:`, `data:`, `file:` и `blob:` MUST отклоняться. Projection MUST NOT выполнять HTTP requests, проверять доступность URL, скачивать ресурс или формировать HTML из недоверенных данных. JSON output MUST оставаться данными и не считаться безопасным HTML.

#### Scenario: Небезопасная или неподдерживаемая схема URL
- **WHEN** image node содержит `http:`, `javascript:`, `data:`, `file:`, `blob:` либо некорректный URL
- **THEN** projection возвращает явную ошибку валидации media и не выдаёт этот URL как reference

#### Scenario: Projection не загружает внешний ресурс
- **WHEN** projection обрабатывает допустимый внешний URL
- **THEN** она строит reference локально без сетевых запросов или скачивания файла

#### Scenario: Владелец внешнего ресурса изменил файл
- **WHEN** внешний владелец изменяет или удаляет ресурс после projection
- **THEN** reference продолжает обозначать сохранённый URL, но не утверждает неизменность содержимого ресурса
