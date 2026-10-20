## MODIFIED Requirements

### Requirement: Publication retention добавляется без перестройки lifecycle

Текущие retention sources MUST оставаться конкретными, а asset lifecycle MUST учитывать immutable snapshot references и current publication cover без изменения upload API, status transitions или storage adapter. Bucket MUST оставаться private. Публичное чтение asset MUST иметь проверенный контекст активной publication. Только refs snapshot, который выбран текущей `PAGE_PUBLICATIONS(status = published)`, и cover текущего publication rendering удерживают physical object для public rendering. Исторические `SNAPSHOT_ASSETS` rows могут оставаться для трассировки, но не удерживают object после переключения publication или unpublish; безопасное освобождение допустимо после отсутствия всех активных retention sources и завершения существующего tombstone/grace процесса.

#### Scenario: Текущая publication удерживает snapshot image
- **WHEN** asset referenced текущим опубликованным snapshot, даже если live document его больше не содержит
- **THEN** GC обнаруживает активный snapshot reference и не переводит asset в deleted

#### Scenario: Текущий publication cover удерживает asset
- **WHEN** asset указан как cover в rendering текущей опубликованной версии
- **THEN** GC сохраняет его до смены/unpublish publication и снятия остальных активных ссылок

#### Scenario: Republish освобождает прежние snapshot-only assets
- **WHEN** новый snapshot становится текущей опубликованной версией и asset старого snapshot не имеет других активных ссылок
- **THEN** историческая `SNAPSHOT_ASSETS` row остаётся неизменной, но перестаёт блокировать GC

#### Scenario: Unpublish снимает publication retention
- **WHEN** publication становится unpublished и asset больше не referenced live page, cover, avatar или другой активной publication
- **THEN** GC может tombstone asset обычной проверкой активных ссылок

#### Scenario: Public renderer разрешает current publication image
- **WHEN** public renderer запрашивает asset, включённый в текущий snapshot или cover и имеющий ready status
- **THEN** backend выдаёт краткоживущий signed read URL через проверенный publication context без публичного bucket

#### Scenario: Historical или чужой snapshot не разрешает public asset access
- **WHEN** asset входит только в предыдущий snapshot либо в snapshot другой страницы
- **THEN** current publication resolver не подписывает и не раскрывает asset

#### Scenario: GC конкурирует с publish
- **WHEN** GC и publish одновременно пытаются изменить retention для одного asset
- **THEN** row locks и повторная проверка references приводят к одному из двух безопасных исходов: GC tombstone завершился первым и publish отклонён, либо publish reference committed первым и GC отклонён

#### Scenario: Physical deletion завершается после DB tombstone
- **WHEN** DB tombstone committed, но object deletion завершается ошибкой
- **THEN** asset больше не получает read URL, а существующий GC retry продолжает physical deletion
