## ADDED Requirements

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
