## ADDED Requirements

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
