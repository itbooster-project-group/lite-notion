## ADDED Requirements

### Requirement: Schema v2 asset media сохраняет schema v1 и использует общий projection

Общая Document Projection boundary из #97 MUST сохранить schema v1 contract и MUST поддержать явно версионированную schema v2, где image media node может содержать `{ type: 'asset', assetId }`. Schema v2 MUST валидировать assetId как UUID и сохранять `nodeId`/presentation attrs согласно media contract. Для asset image projection MUST возвращать derived reference `{ type: 'asset', nodeId, assetId }` и соответствующий canonical JSON из тех же captured bytes. Один asset в разных nodes создаёт разные node references; downstream PAGE_ASSETS сохраняет occurrence по `(pageId, assetId, nodeId)`. Schema v1 external image JSON/references MUST оставаться совместимыми. Projection MUST fail closed на unknown schema/source и не возвращать partial JSON/references. Assets module MUST NOT создавать собственный Yjs decoder или TipTap schema.

#### Scenario: Schema v1 остаётся совместимой
- **WHEN** persisted schema v1 Y.Doc содержит legacy external image nodes
- **THEN** общая projection выдаёт прежний v1 JSON и external references без изменения семантики

#### Scenario: Schema v2 asset image
- **WHEN** captured v2 state содержит валидный image node с UUID nodeId и UUID assetId
- **THEN** общая projection возвращает canonical asset image JSON и derived asset reference из одних bytes

#### Scenario: Некорректный assetId
- **WHEN** schema v2 asset source содержит отсутствующий или невалидный UUID
- **THEN** projection возвращает typed media error и не выдаёт partial JSON/references

#### Scenario: Один asset в нескольких nodes
- **WHEN** два v2 image nodes имеют разные nodeId и один assetId
- **THEN** JSON и derived references сохраняют оба occurrence, а PAGE_ASSETS сохраняет два node-keyed rows

#### Scenario: Unknown schema/source
- **WHEN** captured document объявляет неподдерживаемую версию либо media source type
- **THEN** projection возвращает явную typed error и не меняет persisted bytes

### Requirement: PAGE_ASSETS отражает только успешно committed document revision

Document persistence MUST сохранять текущий merged Y.Doc bytes/schema через существующий API write path и выдавать committed `PAGE_DOCUMENTS.storage_revision`. Write MUST использовать `expectedStorageRevision` CAS. При CAS conflict collaboration MUST apply актуальные persisted Yjs bytes к live Y.Doc средствами Yjs, затем ограниченно retry с новой expected revision; старый captured full state MUST NOT перезаписать более новую committed revision. После commit API MUST вызвать общую Document Projection #97 для exact committed bytes, без декодирования mutable client state Assets-модулем. PAGE_ASSETS occurrence set и `source_storage_revision` MUST обновляться атомарно между собой, только когда текущий storage revision совпадает с projected revision. Document bytes и PAGE_ASSETS могут кратковременно иметь разные revisions; отсутствующий/отставший marker MUST быть явной stale barrier для GC. Projection MUST NOT откатывать marker/references N+1 результатом N. Пустой документ MUST заменить PAGE_ASSETS set на пустой. Повторная обработка одной revision MUST быть идемпотентна. Decoder/schema/eligibility/DB error после document commit MUST оставить предыдущие rows/success marker нетронутыми и запустить диагностику/recovery, но MUST NOT сообщать Hocuspocus, что уже committed document write не состоялся.

#### Scenario: Успешная post-persistence projection
- **WHEN** API успешно сохраняет captured Y.Doc bytes с revision N и общий projection находит допустимые asset refs
- **THEN** отдельная projection transaction заменяет PAGE_ASSETS и marker на N, если document всё ещё на N

#### Scenario: Невалидный asset reference после live sync
- **WHEN** live Hocuspocus document содержит чужой/ungranted asset ID, pending/deleted asset или недекодируемый asset media node, а API успешно сохраняет captured bytes
- **THEN** API сохраняет Y.Doc, оставляет прежние PAGE_ASSETS/marker без частичной замены, отмечает projection stale и не выдаёт metadata/read URL для reference

#### Scenario: Ошибка DB document commit
- **WHEN** document persistence не подтверждает DB commit
- **THEN** projection не запускается, Hocuspocus получает persistence error и повторяет сохранение через существующий save/capture path; успешное повторное сохранение приводит к projection

#### Scenario: Конкурентный устаревший capture
- **WHEN** capture на базе storage revision N приходит после того, как другой collaboration process уже committed N+1
- **THEN** API CAS отклоняет устаревшую запись и возвращает актуальные persisted bytes/revision; collaboration merge-ит эти bytes в live Y.Doc под save mutex и повторяет запись с новой expected revision, сохраняя оба набора CRDT updates

#### Scenario: Projection DB failure после успешного document commit
- **WHEN** document revision N committed, но PAGE_ASSETS/marker transaction завершилась DB error
- **THEN** Y.Doc persistence остаётся успешным, предыдущая projection цела и stale marker не позволяет GC удалять grant-scoped assets

#### Scenario: Повторное применение одной revision
- **WHEN** точный captured document/revision уже успешно применён
- **THEN** повторная операция не создаёт duplicate rows и не регрессирует watermark

#### Scenario: Старая revision завершилась после новой
- **WHEN** projection/rebuild для N приходит после committed N+1
- **THEN** revision check пропускает N и не меняет N+1 references/marker

#### Scenario: Hocuspocus store и #93 capture сериализованы для одной live Document
- **WHEN** обычный `onStoreDocument` и `DocumentCapture` одновременно сохраняют одну Hocuspocus `Document`
- **THEN** Hocuspocus 4.7.0 `storeDocumentHooks` и #93 capture используют один `document.saveMutex`; regression test подтверждает, что старый capture не выполняет позднюю безусловную запись после нового state

#### Scenario: Empty document revision
- **WHEN** поддерживаемый captured document не содержит asset nodes
- **THEN** PAGE_ASSETS очищается в той же transaction, а marker переходит на committed revision

#### Scenario: Live Y.Doc изменился после capture
- **WHEN** collaboration client меняет live Y.Doc после captured bytes, но до completion projection
- **THEN** projection применяет только revision captured bytes и revision check не допускает подмены новой document state

#### Scenario: Asset validation не оставляет live/persisted расхождение
- **WHEN** projection обнаруживает недопустимый asset reference после того, как Hocuspocus уже разослал live update
- **THEN** document write не отклоняется из-за этой validation, live и persisted Y.Doc остаются одинаковыми, а asset остаётся недоступным через page context
