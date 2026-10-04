## 1. Provenance persisted document

- [x] 1.1 Добавить `storageRevision` и `tiptapSchemaVersion` в API internal document record и DTO; передавать revision в wire format десятичной строкой.
- [x] 1.2 Возвращать metadata из той же сериализованной database write, которая сохранила переданные Yjs bytes; сохранить live-page predicate и семантику инкремента revision.
- [x] 1.3 Добавить unit и PostgreSQL integration coverage для согласованного чтения provenance, успешного инкремента revision, неуспешных записей и конкурирующих writes, возвращающих metadata собственных bytes.

## 2. Collaboration capture endpoint

- [x] 2.1 Добавить capture operation: разрешать `page:<pageId>`, использовать active или загружаемый local document, иначе читать одну persisted запись и повторно проверять active state после чтения.
- [x] 2.2 Сериализовать active capture через Hocuspocus `saveMutex`, один раз кодировать live Y.Doc, проверять лимит размера, сохранять те же bytes и возвращать соответствующие storage revision и schema version.
- [x] 2.3 Добавить защищённый service token internal HTTP handler и collaboration-to-API client methods для persisted fallback и сохранения captured state.
- [x] 2.4 Покрыть collaboration unit/integration tests для live state новее persisted, in-flight document load, неизменности captured bytes после edit, cold fallback без загрузки документа, конкуренции store/capture и capture/capture, ровно одного encode, ошибок encode/persistence и отсутствующей страницы.

## 3. API capture и snapshot orchestration

- [x] 3.1 Добавить API collaboration URL/timeout configuration и internal capture client с проверкой ответа, декодированием base64 и преобразованием десятичной storage revision в `bigint`.
- [x] 3.2 Добавить application service: проверять существующую editor permission до capture и передавать один captured result в `CreateSnapshotManualUseCase.execute`; открыть повторное использование capture для доверенных internal callers, не перенося collaboration logic в snapshot use cases.
- [x] 3.3 Проверить unit tests порядок permission check, точные bytes/provenance для manual creation use case, отсутствие snapshot при capture error и обработку timeout/unavailable/not-found.
- [x] 3.4 Добавить PostgreSQL API integration coverage: snapshot хранит captured bytes, `sourceStorageRevision` и `tiptapSchemaVersion`; успешная persistence документа может сохраниться при ошибке вставки snapshot.

## 4. Проверки

- [x] 4.1 Проверить change командой `openspec validate capture-authoritative-document-for-snapshots --strict`.
- [x] 4.2 Выполнить относящиеся к изменённым модулям collaboration/API lint, typecheck, unit/integration checks и API build.
