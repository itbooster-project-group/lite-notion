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
