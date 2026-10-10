# document-snapshot-persistence Specification

## Purpose

Даёт базе данных отдельное append-only domain-хранилище полных бинарных состояний документа, чтобы будущие history, publication и restore могли ссылаться на зафиксированную ревизию без изменения текущего Y.Doc.

## Requirements

### Requirement: Snapshot stores a complete append-only document state

Каждый snapshot MUST хранить уникальный идентификатор, страницу, nullable creator, последовательный revision страницы, исходную `PageDocument.storageRevision`, TipTap schema version, полный бинарный Yjs state, reason и время создания. Snapshot MUST NOT иметь mutable `updatedAt` field и MUST рассматриваться application layer как append-only domain record без update semantics. Произвольный SQL `UPDATE` на уровне базы данных этим requirement не запрещается.

#### Scenario: Persisted snapshot contains document provenance
- **WHEN** database row snapshot существует
- **THEN** row содержит binary Yjs state и source storage revision, позволяющие определить сохранённое состояние и его происхождение

#### Scenario: System-generated snapshot has no user creator
- **WHEN** snapshot создаётся системным процессом без пользовательского инициатора
- **THEN** nullable creator допускает `NULL`, а остальные обязательные snapshot fields сохраняются

#### Scenario: Snapshot update semantics are absent
- **WHEN** следующий application layer предоставляет операции для snapshot
- **THEN** он предоставляет только append/read semantics и не объявляет update operation для существующего snapshot

### Requirement: Snapshot reason is constrained

Snapshot reason MUST принимать только значения `automatic`, `manual`, `publication` или `restore`.

#### Scenario: Valid reason is stored
- **WHEN** snapshot получает одно из четырёх разрешённых значений reason
- **THEN** database принимает row

#### Scenario: Unknown reason is rejected
- **WHEN** snapshot пытаются сохранить с другим reason
- **THEN** database rejects the value through the schema enum constraint

### Requirement: Snapshot revision is unique per page

Для каждой страницы пара `(page, revision)` MUST быть уникальной. История одной страницы MUST поддерживать эффективное чтение по revision в descending order.

#### Scenario: Duplicate page revision is rejected
- **WHEN** для одной страницы пытаются создать второй snapshot с тем же revision
- **THEN** database rejects the insert through a unique constraint

#### Scenario: Page history can be read newest first
- **WHEN** consumer queries snapshots for a page ordered by revision descending
- **THEN** database has a page-scoped descending revision index for that access pattern

### Requirement: Snapshot references existing persistence entities

Каждый non-null page reference MUST указывать на существующую `Page`, а non-null creator MUST указывать на существующего `User`. Удаление страницы MUST удалять её snapshots каскадно; удаление пользователя, который является creator snapshot, MUST быть запрещено, пока сохраняется creator reference.

#### Scenario: Missing page is rejected
- **WHEN** snapshot создаётся с page id, которого нет
- **THEN** database rejects the foreign-key reference

#### Scenario: Missing creator is rejected
- **WHEN** snapshot создаётся с non-null creator id, которого нет
- **THEN** database rejects the foreign-key reference

#### Scenario: Page deletion removes dependent snapshots
- **WHEN** page удаляется
- **THEN** dependent snapshot rows are deleted by the page foreign-key cascade

### Requirement: Source storage revision is searchable per page

Snapshot storage MUST иметь page-scoped index по `sourceStorageRevision`, чтобы находить snapshots, созданные из заданной или ближайшей persisted revision документа.

#### Scenario: Source revision lookup uses an index
- **WHEN** consumer ищет snapshots страницы по source storage revision
- **THEN** database provides a `(page, source storage revision DESC)` index for the lookup

### Requirement: Snapshot creator foreign-key lookup is indexed

Snapshot storage MUST иметь отдельный индекс по nullable `createdById`, потому что creator является foreign key с `Restrict` и должен эффективно обслуживать проверки/операции, связанные с пользователем.

#### Scenario: Creator lookup uses an index
- **WHEN** database checks or queries snapshots by creator id
- **THEN** database provides an index on `createdById`

### Requirement: Capture связывает Yjs-состояние с его persisted revision
Система MUST возвращать captured document state, в котором Yjs bytes, storage revision и TipTap schema version описывают одно persisted состояние документа. Если документ активен в collaboration, capture MUST использовать authoritative live state и сохранить именно эти bytes до возврата результата. Если документ не активен, capture MUST прочитать bytes и metadata из одной согласованной persisted записи, не загружая документ в collaboration. Неуспешный или неполный capture MUST NOT создавать snapshot.

#### Scenario: Capture активного документа новее persisted state
- **WHEN** live collaboration document содержит edits, ещё не сохранённые в хранилище
- **THEN** capture сохраняет и возвращает эти bytes с revision, присвоенной этой записи, и соответствующей schema version

#### Scenario: Edit происходит после capture
- **WHEN** edit приходит после того, как capture закодировал состояние
- **THEN** возвращённые captured bytes остаются неизменными и указывают на более раннюю persisted revision

#### Scenario: Capture неактивного документа
- **WHEN** документ страницы отсутствует и в live map, и среди документов, которые сейчас загружаются
- **THEN** capture возвращает Yjs bytes, storage revision и schema version из одной persisted записи, не загружая документ

#### Scenario: Документ начинает загружаться во время cold fallback
- **WHEN** загрузка документа начинается, пока capture читает persisted запись
- **THEN** capture использует загруженный live document и не возвращает fallback как состояние уже активного документа

#### Scenario: Persistence конкурирует с capture
- **WHEN** collaboration store и capture одновременно сохраняют состояния одного active документа
- **THEN** каждая успешная persistence получает отдельную упорядоченную storage revision, соответствующую записанным ею bytes

#### Scenario: Одновременно выполняются два active capture
- **WHEN** два capture одного active документа выполняются параллельно
- **THEN** каждый возвращает состояние с соответствующей storage revision, а успешные записи получают последовательные revisions

#### Scenario: Ошибка encode или persistence
- **WHEN** encode или persistence завершается ошибкой до возврата полного capture
- **THEN** capture завершается ошибкой и snapshot не создаётся

#### Scenario: Collaboration недоступен или запрос превысил timeout
- **WHEN** API не может завершить внутренний capture request
- **THEN** snapshot не создаётся; persistence, завершившаяся до потери ответа, может остаться без snapshot

#### Scenario: Page отсутствует или удалена во время capture
- **WHEN** capture не находит live page document
- **THEN** он возвращает существующий not-found результат и snapshot не создаётся

### Requirement: Manual current snapshot use case повторно использует один captured state
`CreateCurrentManualSnapshotUseCase` MUST получить одно captured document state через самостоятельную `DocumentCapture` application boundary и передать те же bytes и provenance в `CreateSnapshotManualUseCase`. Manual snapshot creation MUST проверить существующую edit permission страницы до capture и MUST сохранить существующие правила manual reason и creator. `CreateSnapshotManualUseCase` MUST сохранить финальную permission-проверку перед вставкой. Capture-specific behavior MUST оставаться вне snapshot creation use cases; будущие consumers, включая publication, MUST зависеть напрямую от `DocumentCapture`.

#### Scenario: Создание manual snapshot
- **WHEN** пользователь с edit permission запрашивает manual snapshot
- **THEN** application один раз захватывает текущий документ и создаёт manual snapshot с captured bytes, storage revision и schema version

#### Scenario: У пользователя нет права создать manual snapshot
- **WHEN** пользователь без edit permission запрашивает manual snapshot
- **THEN** запрос отклоняется до capture и snapshot не создаётся

#### Scenario: Ошибка capture при создании manual current snapshot
- **WHEN** capture завершается ошибкой
- **THEN** `CreateCurrentManualSnapshotUseCase` не вызывает snapshot creation

#### Scenario: Ошибка вставки snapshot после успешного capture
- **WHEN** persistence документа завершается успешно, но вставка snapshot завершается ошибкой
- **THEN** snapshot не создаётся, а успешная persistence документа остаётся действительной

#### Scenario: Будущий workflow создаёт snapshot и derived data
- **WHEN** caller нужны snapshot и derived output одной версии документа
- **THEN** он может повторно использовать один captured state для обеих операций, не запрашивая новый capture

### Requirement: Создание snapshot использует захваченное состояние документа

Создание snapshot MUST принимать уже захваченное authoritative состояние документа: неизменяемые Yjs bytes, исходный storage revision и TipTap schema version. Каждый create use case MUST копировать входной `Uint8Array` синхронно до первого `await`, чтобы последующая мутация caller не меняла сохраняемые bytes. Система MUST сохранять эти значения вместе с последовательным page-scoped revision, reason, creator и временем создания. Revision MUST быть уникальным и consecutive в пределах страницы; allocation algorithm MUST NOT создавать пропуски. Существующий `@@unique([pageId, revision])` MUST оставаться дополнительной гарантией БД. Application API MUST NOT предоставлять операции обновления или замены созданного snapshot.

#### Scenario: Первый snapshot страницы
- **WHEN** для страницы без предыдущих snapshot создаётся snapshot
- **THEN** ему назначается revision `1` и сохраняется provenance захваченного документа

#### Scenario: Последующие snapshot одной страницы
- **WHEN** для одной страницы создаётся несколько snapshot
- **THEN** каждый получает уникальный последовательный revision в пределах этой страницы

#### Scenario: Параллельное создание snapshot одной страницы
- **WHEN** два snapshot одной страницы создаются одновременно
- **THEN** оба успешно создаются и получают последовательные, не повторяющиеся page-scoped revision

#### Scenario: Параллельное создание продолжает существующую историю
- **WHEN** последний revision страницы равен `5` и два новых snapshot создаются одновременно
- **THEN** оба успешно сохраняются с revision `6` и `7`, без дубликатов и пропуска существующей page-scoped sequence

#### Scenario: Snapshot разных страниц
- **WHEN** одновременно создаются snapshot разных страниц
- **THEN** у каждой страницы своя последовательность revision, и блокировка одной страницы не задерживает создание snapshot другой страницы

#### Scenario: Сохранение provenance захвата
- **WHEN** snapshot создаётся из captured document state
- **THEN** его Yjs bytes, source storage revision, TipTap schema version, reason и creator соответствуют переданным захвату и команде создания

### Requirement: Создание пользовательских и внутренних snapshot имеет разные правила

Write operations MUST быть представлены отдельными `CreateSnapshotManualUseCase.execute()` и `CreateSnapshotInternalUseCase.execute()`; один use case соответствует одной application operation и имеет один публичный entry point `execute()`. Пользовательское создание snapshot MUST назначать `reason = manual` и MUST разрешаться только владельцу или редактору страницы. Вызывающий код пользовательского application API MUST NOT выбирать reason. Только trusted internal use case MUST принимать системные reasons `automatic`, `publication` и `restore`. Effective role MUST проверяться существующим permission mechanism перед snapshot creation. Page-row lock MUST сериализовать revision allocation, но не гарантирует сериализацию отзыва permission относительно создания snapshot. Пользователь с недостаточной ролью на доступной ему странице MUST получить отказ доступа; для страницы без effective access MUST сохраняться безопасная not-found семантика проекта. Внутреннее создание MUST принимать системные reasons без требования пользовательского actor. `SnapshotsService` MUST отвечать только за metadata reads; internal creation use case MUST быть доступен через `SnapshotsModule` для будущих backend workflows.

#### Scenario: Владелец создаёт manual snapshot
- **WHEN** владелец создаёт snapshot из captured document state
- **THEN** создание успешно, `reason` равен `manual`, а creator — владелец

#### Scenario: Редактор создаёт manual snapshot
- **WHEN** редактор создаёт snapshot из captured document state
- **THEN** создание успешно, `reason` равен `manual`, а creator — редактор

#### Scenario: Viewer пытается создать snapshot
- **WHEN** viewer создаёт snapshot для доступной ему страницы
- **THEN** создание отклоняется как forbidden

#### Scenario: Пользователь не имеет доступа к странице
- **WHEN** пользователь создаёт snapshot для отсутствующей, удалённой или недоступной страницы
- **THEN** сохраняется существующая безопасная not-found семантика

#### Scenario: Внутренний вызов создаёт системный snapshot
- **WHEN** внутренний use case создаёт snapshot с системным reason
- **THEN** создание успешно без требования пользовательского actor

### Requirement: Создание snapshot участвует во внешней транзакции

Оба create use case MUST поддерживать самостоятельное выполнение в транзакции и выполнение внутри переданного caller transaction scope. При наличии внешнего scope запись MUST использовать его и MUST NOT открывать отдельную транзакцию; rollback внешней транзакции MUST отменять создание snapshot.

#### Scenario: Создание snapshot внутри внешней транзакции
- **WHEN** create use case создаёт snapshot с активным transaction scope
- **THEN** snapshot записывается в этой транзакции и фиксируется либо откатывается вместе с вызывающим кодом

#### Scenario: Внешняя транзакция откатывает snapshot
- **WHEN** внешняя транзакция создаёт snapshot через переданный scope, а затем завершается ошибкой и выполняет rollback
- **THEN** созданный snapshot отсутствует в базе данных

### Requirement: Metadata snapshot читаются без состояния документа и с проверкой доступа

Backend MUST предоставлять список metadata snapshot страницы в порядке `revision DESC` и чтение metadata одного snapshot. Оба метода MUST требовать effective access к запрошенной странице; владельцы, редакторы и viewers с таким доступом могут читать metadata. Проверка MUST использовать существующую логику page permissions, а не отдельный алгоритм. Lookup snapshot MUST быть ограничен одновременно `pageId` и `snapshotId`. Отсутствующая, удалённая, недоступная страница и snapshot другой страницы MUST сохранять безопасную not-found семантику. Metadata MUST включать id, revision, reason, createdAt, creator, source storage revision и TipTap schema version и MUST NOT включать Yjs state.

#### Scenario: Владелец читает metadata snapshot
- **WHEN** владелец запрашивает metadata своей страницы
- **THEN** metadata возвращаются по `revision DESC` без Yjs state

#### Scenario: Редактор читает metadata snapshot
- **WHEN** редактор запрашивает metadata страницы, к которой у него есть effective access
- **THEN** metadata возвращаются по `revision DESC` без Yjs state

#### Scenario: Viewer читает metadata snapshot
- **WHEN** viewer запрашивает metadata страницы, к которой у него есть effective access
- **THEN** metadata возвращаются без Yjs state

#### Scenario: Нет доступа к metadata страницы
- **WHEN** пользователь запрашивает metadata отсутствующей, удалённой или недоступной страницы
- **THEN** сохраняется существующая безопасная not-found семантика

#### Scenario: Чтение metadata одного snapshot
- **WHEN** владелец, редактор или viewer запрашивает metadata snapshot своей доступной страницы
- **THEN** ответ содержит metadata snapshot и не содержит его Yjs bytes

#### Scenario: Snapshot принадлежит другой странице
- **WHEN** lookup metadata выполняется с `snapshotId`, не принадлежащим указанному `pageId`
- **THEN** запрос завершается с той же безопасной not-found семантикой

#### Scenario: Недоступна страница snapshot
- **WHEN** пользователь запрашивает metadata snapshot отсутствующей, удалённой или недоступной страницы
- **THEN** сохраняется безопасная not-found семантика без раскрытия существования snapshot
