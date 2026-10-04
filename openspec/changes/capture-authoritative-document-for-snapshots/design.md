## Контекст

Существующая snapshot-инфраструктура уже сохраняет неизменяемое Yjs-состояние, но вызывающая сторона должна передать байты и provenance. Оставшаяся часть issue #48 связывает authoritative collaboration document с сохранённым `storageRevision`, чтобы snapshot не связывал состояние с revision другого состояния.

Приложение collaboration работает как отдельный Hocuspocus-процесс. `onLoadDocument` загружает состояние через внутренний маршрут API, а debounced `onStoreDocument` сохраняет его через сервисный `PUT /internal/pages/:pageId/document`. `PageDocument.storageRevision` увеличивается при каждой успешной записи. Hocuspocus хранит активные документы в локальной map; его `saveMutex` сериализует hook `onStoreDocument` для одного документа, но не блокирует применение Yjs edits к live document. Redis распространяет updates между инстансами, однако в проекте нет маршрутизации capture к инстансу-владельцу документа.

## Цели и ограничения

**Цели:**

- Использовать существующий application contract `CapturedDocumentState`.
- Связывать возвращённые bytes с revision, выделенной при сохранении именно этих bytes, и соответствующей schema version.
- Поддержать active и не загруженный документы в рамках текущей single-instance модели collaboration.
- Выполнять manual current snapshot в `CreateCurrentManualSnapshotUseCase`, используя отдельную от snapshots `DocumentCapture` boundary.

**Не входит в изменение:**

- Изменение схемы snapshot, snapshot revision allocation, permission algorithm, metadata reads или уже реализованного immutable storage.
- Public REST endpoint или frontend flow для manual snapshot.
- Маршрутизация к владельцу документа между несколькими collaboration-инстансами, distributed locks, distributed transaction или message broker.
- Publication, renderings, restore, History UI, automatic snapshots и сохранение snapshot при каждом Yjs store.

## Решения

### Контракт и алгоритм capture активного документа

Application layer API получает `CapturedDocumentState` (`yjsState`, `storageRevision: bigint`, `tiptapSchemaVersion`) через HTTP adapter. Adapter не зависит от Hocuspocus или механизма хранения.

Collaboration добавляет защищённый сервисным credential маршрут `POST /internal/documents/:pageId/capture` к существующему HTTP listener. Он строит каноническое имя документа `page:<pageId>` и ищет уже загруженный документ, не запуская его загрузку только ради capture.

Для активного документа capture выполняется внутри его `saveMutex`: один раз вызывается `Y.encodeStateAsUpdate`, проверяется существующий лимит размера, а полученные bytes используются как неизменяемый capture candidate. Те же bytes отправляются в API persistence route. API возвращает revision и schema version из строки, обновлённой этой операцией; collaboration добавляет к ним те же закодированные bytes. Последующие edits не меняют полученный массив. Обычный Hocuspocus store также использует этот `saveMutex` и после capture может сохранить более новое состояние с более поздней revision.

Два параллельных active capture одного документа последовательно проходят через один `saveMutex`. Каждый capture сохраняет bytes отдельно и получает собственную revision, даже если два состояния совпадают. Capture, ожидающий store, и store, ожидающий capture, также сериализуются; каждой успешной записи соответствует её собственная revision.

### Schema version в provenance

`tiptapSchemaVersion` — metadata persisted document в `PageDocument`, а не версия, которую collaboration независимо вычисляет или меняет во время capture. Capture persistence обновляет Yjs bytes и получает `tiptapSchemaVersion` из той же строки, откуда возвращается `storageRevision`. Cold fallback читает bytes, revision и schema version из одной записи. Поэтому schema version, возвращённая этой операцией, считается версией captured document state.

Если в будущем появится online schema migration, этот контракт потребуется пересмотреть: миграция должна определить, как schema version связывается с состоянием и revision при конкурентном capture.

### Создание и first-write `PageDocument`

Текущий application flow создаёт `PageDocument` заранее: `CreatePageUseCase` вставляет страницу и пустой документ в одной транзакции. Ошибка вставки документа откатывает создание страницы. Это проверяется существующим PostgreSQL тестом `apps/api/src/pages/create-atomicity.integration-spec.ts`.

Поэтому capture и persistence не выполняют upsert или first-write для отсутствующей строки. Их `UPDATE` затрагивает только существующую запись; отсутствие документа для live page возвращает not-found. Для страниц, созданных поддерживаемым application flow, гонка двух первых записей невозможна: обе операции получают уже созданную строку `PageDocument` и PostgreSQL сериализует их `UPDATE` по этой строке.

### Cold fallback

Перед cold fallback collaboration проверяет и `documents`, и `loadingDocuments` Hocuspocus. Если загрузка уже выполняется, capture ожидает её и сохраняет live document через активный путь. Если обе map не содержат документа, collaboration читает одну persisted запись через внутренний API. После завершения чтения он синхронно повторно проверяет обе map: если за это время началась загрузка или появился live document, capture использует его; иначе возвращает прочитанную запись. Эта повторная проверка не даёт принять cold fallback за источник уже активного документа и не вызывает загрузку документа только ради capture.

API читает `yjsState`, `storageRevision` и `tiptapSchemaVersion` одним запросом и возвращает одну запись. Документ не загружается в Hocuspocus и не записывается повторно при настоящем cold fallback.

В этой модели отсутствие документа в локальной map означает отсутствие live document на collaboration-процессе. При переходе на несколько процессов одного fallback недостаточно: случайный инстанс за load balancer может не владеть активным документом. Redis synchronization не считается механизмом выбора authoritative владельца.

Ошибка active capture не переводит запрос на persisted fallback. Fallback применяется только когда live document отсутствует до начала capture; это исключает возврат потенциально stale состояния после неудачной live persistence.

### Persistence и семантика revision

`storageRevision` увеличивается только успешным SQL `UPDATE`. API возвращает `UPDATE ... RETURNING` из той же операции, которая записала переданные bytes и увеличила revision. Последующий незаблокированный `SELECT` не используется. Конкурирующие updates сериализуются PostgreSQL на строке `PageDocument`; возвращённая каждой операцией запись содержит именно её записанные bytes, присвоенную revision и schema version строки.

Обычный `onStoreDocument` продолжает пользоваться тем же API writer; он может игнорировать возвращаемую provenance. Так сохраняется единая семантика revision для фонового store и явного capture. Успешный capture означает, что bytes записаны с возвращённой revision. Если последующий store обновит документ до вставки snapshot, capture всё равно относится к своей успешной persistence point. Distributed transaction между сервисами API и collaboration нет.

### Внутренний HTTP contract и безопасность

API вызывает настроенный прямой collaboration base URL, а не public gateway. Маршрут capture использует общий `x-internal-service-token` и constant-time сравнение по существующему шаблону. Credential передаётся только server-to-server. Gateway возвращает 404 для `/internal/` до публичной маршрутизации collaboration; прямые service ports являются внутренними адресами.

JSON-ответ содержит `pageId`, base64 `yjsState`, десятичную строку `storageRevision` и числовой `tiptapSchemaVersion`. API проверяет форму ответа, декодирует base64, преобразует revision в `bigint` и формирует `CapturedDocumentState`. Используются `COLLABORATION_BASE_URL` (локальное значение по умолчанию `http://localhost:3002`) и настраиваемый `COLLABORATION_TIMEOUT_MS` (по умолчанию 5000 мс). Timeout и transport error преобразуются в service-unavailable ошибку; not-found — в существующую ошибку страницы. Некорректный ответ, encode error или persistence error не возвращают capture.

### Граница capture и manual snapshot use case

`DocumentCapture` — самостоятельная API application boundary, реализованная клиентом collaboration internal endpoint и доступная consumers вне snapshot-модуля. `CreateCurrentManualSnapshotUseCase` получает её вместе с существующим `PagePermissionsService` и `CreateSnapshotManualUseCase`. Manual flow сначала требует `EDITOR`, затем ровно один раз захватывает состояние и передаёт те же bytes и provenance в `CreateSnapshotManualUseCase.execute`. Последний повторно проверяет permission внутри своей транзакции перед вставкой snapshot. Предварительная проверка не запускает capture для неавторизованного пользователя; повторная защищает от revoke между capture и вставкой. `SnapshotsService` остаётся read-only metadata API. Будущая publication зависит непосредственно от `DocumentCapture`, а не от snapshot слоя.

Internal document persistence вызывается из `InternalController` через `PersistPageDocumentStateUseCase`, который передаёт write в `PageDocumentRepository`. `PageDocumentService` остаётся read-side для internal document reads. Repository сохраняет атомарные `UPDATE ... RETURNING`, live-page predicate и текущую семантику `storageRevision`.

Доверенный caller может запросить capture и передать тот же объект в `CreateSnapshotInternalUseCase.execute` вместе с derived operations. Capture result остаётся пригодным для других производных операций. Snapshot use cases не знают о collaboration endpoint и не запрашивают Y.Doc повторно.

### Ограничение по числу инстансов

API capture client обращается к настроенному collaboration endpoint. Текущая runtime-модель предоставляет один collaboration instance и не связывает страницу с конкретной репликой. Гарантия live capture ограничена этой моделью. При горизонтальном масштабировании до использования capture потребуется определить маршрутизацию по владельцу документа или другой способ получить authoritative Y.Doc; load-balanced fallback на persisted state такой гарантии не даёт.

### Ошибки и согласованность

- Ошибка encode происходит до persistence; capture и snapshot не создаются.
- Ошибка записи не подтверждает revision и не создаёт snapshot. Если API выполнил commit, но ответ потерялся или истёк timeout, capture завершается ошибкой; записанная revision может остаться без snapshot.
- Недоступность collaboration или timeout API-to-collaboration не создаёт snapshot. Persisted fallback после ошибки live capture не используется.
- Отсутствующая или soft-deleted page/document возвращает not-found. Если удаление произошло после capture persistence, существующая проверка live page при создании snapshot отклонит вставку; запись документа может сохраниться.
- Ошибка вставки snapshot после успешного capture оставляет persisted document state и revision без snapshot. Это допустимо между отдельными сервисными операциями.

## Риски и компромиссы

- Ответ может потеряться после commit API → не создавать snapshot без полного ответа; разрешить сохранённую revision без snapshot.
- Вторая collaboration replica может не содержать active Y.Doc → ограничить гарантию текущим single-instance режимом; перед масштабированием добавить маршрутизацию к владельцу.
- Permission может измениться между предварительной проверкой, capture и вставкой snapshot → сохранить обе существующие проверки; capture revision может остаться без snapshot.
- Schema version хранится в `PageDocument`, а не в Hocuspocus → возвращать её из той же операции записи/чтения, что и provenance bytes.
- Полное состояние передаётся через внутренний HTTP и base64 увеличивает payload → использовать существующий лимит размера документа и body limit.

## План миграции

Миграция базы не нужна. API изменения persistence contract, collaboration capture endpoint, use cases и configuration развёртываются вместе. Для окружения задаются прямой collaboration URL и timeout. Откат может удалить manual current snapshot use case и capture endpoint; дополнительные поля внутреннего ответа и атомарная persistence остаются совместимыми с обычными store callers.
