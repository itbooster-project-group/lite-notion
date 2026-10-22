## Context

См. `proposal.md` — Why и scope; поведенческий контракт находится в `specs/page-search/spec.md`.

В текущем API persisted Yjs состояние хранится в `PageDocument.yjsState` с монотонным `storageRevision`. `PersistPageDocumentStateUseCase` сначала сохраняет байты через условный SQL update, затем запускает asset projection. Общий `projectDocument({ yjsState, tiptapSchemaVersion })` декодирует только schema-aware persisted state и возвращает `contentJson` и media references; он не возвращает plain text. Asset retry уже использует PostgreSQL state и `@nestjs/schedule`, а публикации получают rendering из той же document projection.

Effective permissions реализованы в `PagePermissionsService` / `PagePermissionsRepository`. `resolveRole` поднимается по странице и наследуемым предкам до `RESTRICTED` boundary, а permissions query исключает soft-deleted страницу и проект. `findAccessiblePages` и `/pages/shared` показывают дерево из accessible rows; при недоступном родителе дочерний accessible result становится корнем. Search использует этот permission boundary, а не дерево для загрузки всех страниц.

В Prisma schema и migrations нет search модели, tsvector или GIN search indexes. Существующие модели используют Prisma PascalCase names и quoted PostgreSQL columns. `Page` содержит актуальный title и soft-delete state; restore уже меняет lifecycle без переписывания Y.Doc. `DocumentRendering` из публикаций — отдельная immutable read model и не источник поиска.

## Goals / Non-Goals

**Goals:** сохранять body projection вместе с source revision; в фоне находить отсутствующие/отставшие строки и ошибки; искать в актуальном title и актуальном indexed body; до выдачи результата проверять effective permissions; поддержать PostgreSQL, повторный backfill и строгую revision safety.

**Non-Goals:** менять Hocuspocus persistence или общий document projection contract; индексировать realtime state, historical snapshots или public renderings; добавлять Redis/BullMQ, внешний search engine, fuzzy/semantic search, UI или breadcrumb/path.

## Decisions

### 1. Prisma model и индексы

Добавить физическую таблицу `PageSearchDocument` (логическая `PAGE_SEARCH_DOCUMENTS`) с полями `pageId` (PK/FK на `Page`, cascade), `plainText`, `searchVector` (`tsvector`), nullable `sourceStorageRevision BigInt` и `attemptedStorageRevision BigInt`, `updatedAt` и retry state `attemptCount`, `retryAfter`, `lastErrorCode`. Тип ревизии совпадает с `PageDocument.storageRevision`. В Prisma для native `tsvector` использовать `Unsupported("tsvector")`; чтение/запись вектора выполнять параметризованным raw SQL.

Миграция создаёт GIN по body `searchVector` и GIN expression index по `to_tsvector('simple', COALESCE("title", ''))` на `Page`. Индекс title не дублирует title в projection и сразу видит rename. Body index строится при успешной индексации. Для отсутствующей projection не создавать пустую массовую backfill-таблицу: scheduler выбирает страницы без строки через `LEFT JOIN`; при первой ошибке индексатор создаёт пустой placeholder с retry state. Пустой документ после успешной обработки отличается от placeholder наличием `sourceStorageRevision`.

### 2. Text extraction через существующую projection boundary

Search вызывает `projectDocument` с persisted bytes и сохранённым `tiptapSchemaVersion`, затем локальный обход `contentJson` собирает текстовые leaf nodes с разделителями между block nodes. Включать авторский `caption` и `alt` у media nodes, если они заданы; исключать `nodeId`, `src`, URL, asset IDs, video IDs, alignment/width и другие служебные attrs. Не менять общий `DocumentProjection` тип и не добавлять Search-specific Yjs/ProseMirror decoder.

Schema/decode ошибки считаются permanent для данной revision; до изменения authoritative revision автоматический scheduler её повторно не обрабатывает. Текущая и предыдущая корректная проекция остаются неизменными при ошибке.

### 3. Индексация, транзакция и revision safety

Создать локальный search indexing use case, принимающий persisted `PageDocumentRecord`, и sibling Nest scheduler на базе `ProjectionRetryScheduler` pattern. Периодический запуск — каждые 15 секунд, batch — не более 25 eligible документов. Запрос кандидатов делает `LEFT JOIN` к search projection и считает документ устаревшим, если строки нет, `sourceStorageRevision IS NULL` либо `sourceStorageRevision < PageDocument.storageRevision`. Пустой успешный документ остаётся отличим от placeholder по ненулевой обработанной revision.

Eligibility вычисляется **до `ORDER BY`/`LIMIT`**. Строка без projection или с `attemptedStorageRevision IS DISTINCT FROM PageDocument.storageRevision` eligible сразу: новая authoritative revision тем самым сбрасывает блокировку старой ревизии. Для той же revision кандидат eligible, только если он не permanent/exhausted, `attemptCount < max`, а `retryAfter IS NULL OR retryAfter <= now()`. SQL должен явно обработать nullable `lastErrorCode` (`COALESCE` или эквивалент), чтобы NULL не исключал retry. Permanent/exhausted строки не должны занимать batch и вызывать starvation других страниц. Строка placeholder с `sourceStorageRevision = NULL` остаётся кандидатом при наступлении retryAfter; отсутствие проекции и NULL revision не маскируются обычным сравнением `<`.

Selection следует эквивалентной форме `needs_work AND retry_eligible`, где `needs_work := projection.pageId IS NULL OR projection.sourceStorageRevision IS NULL OR projection.sourceStorageRevision < document.storageRevision`; `retry_eligible := projection.pageId IS NULL OR projection.attemptedStorageRevision IS DISTINCT FROM document.storageRevision OR (COALESCE(projection.lastErrorCode, '') NOT IN (permanent, exhausted) AND projection.attemptCount < max AND (projection.retryAfter IS NULL OR projection.retryAfter <= now()))`. Затем применяется стабильный keyset order по `PageDocument.pageId` и только после этого `LIMIT`. После исчерпания страницы скан продвигается по cursor, циклически обходя диапазон; поэтому постоянные ошибки не удерживают начало каждой выборки.

Индексирование не входит в synchronous persistence path и никогда не читает realtime Y.Doc state. Scheduler выбирает только persisted revisions. Локальный re-entry guard повторяет существующий pattern; distributed lock и очередь не вводятся. Повторная работа на нескольких instances допустима, а транзакционные проверки ниже защищают результат.

Текст строится до транзакции. И success, и failure path в транзакции сначала блокируют authoritative `PageDocument` row через `SELECT ... FOR UPDATE`, затем перечитывают revision и прекращают работу, если она уже не равна revision задания. Success path записывает projection через параметризованный `INSERT ... ON CONFLICT (pageId) DO UPDATE` с условием, что сохранённая projection revision не выше входной. Проверка authoritative row плюс монотонный upsert предотвращают как запись устаревшего документа, так и out-of-order overwrite.

Failure path использует ту же блокировку authoritative row. После проверки revision он блокирует/проверяет projection row: если уже есть успешная projection с `sourceStorageRevision >= revision задания`, failure path ничего не меняет; иначе он вставляет placeholder при отсутствии строки или обновляет **только** retry/diagnostic columns, не меняя `plainText`, `searchVector` и `sourceStorageRevision`. При переходе на новую authoritative revision попытки начинаются заново. Поэтому worker A, завершившийся ошибкой на revision 15 после успешной записи worker B revision 16, не может изменить ни projection 16, ни её retry diagnostics. Аналогично, новая authoritative revision, сохранённая во время извлечения, заставит оба write path отказаться от старого задания.

Повтор той же revision идемпотентен. PostgreSQL integration tests должны проверять блокировки и конкурентные транзакции; mock-тесты для этих гарантий недостаточны.

### 4. Retry и backfill/rebuild

Retry state хранится на projection row, не в новой таблице очереди. Transient error использует exponential backoff 1s, 2s, 4s… с cap 5 минут и максимум 5 попыток; permanent validation error и exhausted revision не выбираются до новой revision или принудительного rebuild. Placeholder на первую ошибку хранит `sourceStorageRevision = NULL`, `attemptedStorageRevision = failed revision`, счётчик, retryAfter и безопасный error code. Новая attempted revision начинает счётчик с первой попытки. При ошибке принудительного `--all` для уже успешно проиндексированной равной revision предыдущая успешная projection и её retry metadata остаются без изменений; ошибка попадает в logs и summary/exit result CLI, а повтор происходит при следующем явном запуске. В этом случае новый retry state не записывается. При успехе forced rebuild записывает новую projection той же revision и очищает retry diagnostics. Диагностика не содержит document text.

Если запись retry/failure state падает (например, PostgreSQL временно недоступен), обработчик не должен считать попытку зафиксированной, менять in-memory eligibility или продолжать дорогостоящую обработку следующего batch. Он пишет ограниченный безопасный лог, прекращает текущий batch и отдаёт повтор scheduler следующему интервалу. Когда БД доступна для selection, но retry-запись не проходит, локальный обход кандидатов должен продвигаться keyset cursor-ом с циклическим возвратом, чтобы один неисправный документ не забирал каждый batch; durable backoff при недоступной БД невозможен, поэтому частоту повторов ограничивают интервал scheduler и batch cap. Несколько instances могут повторить работу, но revision-safe failure path сохраняет корректность.

Backfill использует простой CLI entrypoint `search:rebuild-projection` по образцу существующего asset projection rebuild script. Обычный режим revision-aware: уже успешно обработанная равная revision пропускается. `--all` — **принудительный rebuild** для изменения extraction/vector logic: он повторно пишет projection даже при `sourceStorageRevision = current storageRevision`. При ошибке на равной revision с существующей успешной projection сохраняет прежние данные и retry metadata, сообщает ошибку в logs и результате CLI и не создаёт retry state; оператор повторяет rebuild явным запуском. Оба режима используют тот же extractor/indexer и authoritative revision guard. Rebuild допускает запись при равной revision только если authoritative revision всё ещё равна revision задания; он никогда не заменяет более новую projection старой ревизией.

Во время rolling deployment разные версии projection algorithm не должны одновременно обрабатывать одни и те же revisions: схема не содержит projector-version и не может определить, какая projection новее по алгоритму при равном `storageRevision`. Поэтому принудительный `--all` запускается после перевода всех backend instances на одну версию и остановки/дренирования старых workers; если потребуется безопасное смешанное обновление, отдельным будущим изменением понадобится version marker/coordination.

### 5. FTS, title/body ranking и snippet

Использовать PostgreSQL built-in `simple` configuration одинаково при `to_tsvector` и `websearch_to_tsquery`. Она токенизирует русские, английские и смешанные слова без языкового определения и не применяет stemming/языковые stop-word dictionaries. Trade-off: словоформы не нормализуются. Пунктуация/whitespace без полезных лексем возвращает пустой результат; короткий распознаваемый токен допустим. До candidate query проверять `querytree(tsquery)`: если результат пуст или `T` (например, только отрицательное выражение), возвращать пустой список, поскольку нет положительной indexable части.

Title индексируется отдельным GIN expression index по `to_tsvector('simple', COALESCE("title", ''))`; body — GIN по хранимому `searchVector`. Прямой `LEFT JOIN` с `title @@ q OR body @@ q` объединяет условия по двум разным relation, часто не даёт планировщику применить оба GIN как индексируемый BitmapOr. Поэтому concrete SQL strategy — две параметризованные indexable candidate ветви и `UNION ALL`: первая ищет только Page title через выражение, идентичное expression index; вторая ищет PageSearchDocument vector, join-ит `PageDocument` и требует `sourceStorageRevision = storageRevision`. Ветка body может содержать и другие безопасные eligibility predicates. Обе ветви выдают candidate page ID, field-match flag и field rank. Результат обязательно агрегируется `GROUP BY pageId` **до permissions filtering и пагинации**, используя `BOOL_OR(title_match)`, `MAX(title_rank)`, `MAX(body_rank)`. После агрегации кандидаты упорядочиваются по title match, rank и `pageId`; Search проверяет effective permissions для ordered batches и добирает следующие batches, а итоговый limit применяется только к разрешённым уникальным страницам. Поэтому совпадение title и body не создаёт дубль и закрытые результаты не уменьшают полноту выдачи. Title expression не хранится в projection; rename сразу отражается в запросе без reindex.

Для обычного многословного запроса `websearch_to_tsquery('simple', query)` задаёт семантику PostgreSQL: некавыченные слова conjunctive. Все положительные термины должны совпасть **внутри одного поля** — целиком в текущем title или целиком в свежем body; распределённые совпадения (например, `alpha` только в title и `beta` только в body для запроса `alpha beta`) не дают результата. Явные `OR`, фразы и отрицания следуют семантике `websearch_to_tsquery`; отрицательное-only выражение пропускается защитой `querytree`. Это сохраняет индексируемость отдельных ветвей и не требует искусственного объединённого источника текста.

Сначала сортировать `title_match DESC`, затем `GREATEST(title_rank, body_rank) DESC`, затем `pageId ASC`; rank вычислять параметризованным `ts_rank_cd` в той же FTS configuration. Это задаёт стабильный порядок и гарантирует title priority. Получать candidate IDs/rank ограниченными ordered batches и продолжать после permissions filtering до набора разрешённого limit; нельзя применять общий limit до проверки доступа.

Перед выдачей metadata пакетно проверять permissions. Только после этого для разрешённых результатов с актуальной body projection строить snippet через `ts_headline('simple', plainText, query, options)`. Указать пустые `StartSel`/`StopSel` и запретить HTML highlight markers; далее обрезать до 240 символов. `ts_headline` сам по себе не гарантирует HTML-safe output: API трактует snippet исключительно как plain text, frontend обязан вывести его с обычным escaping и не использовать как HTML. Для title-only результата и отсутствующей/устаревшей body возвращается `null`. SQL выполняется параметризованно; пользовательская строка никогда не конкатенируется в SQL.

До принятия запроса выполнить `EXPLAIN (ANALYZE, BUFFERS)` для обоих candidate branches на репрезентативном, достаточно большом PostgreSQL dataset после `ANALYZE`; проверить фактическое использование title и body GIN indexes, cardinality, время и отсутствие глобального early LIMIT. Малые тестовые таблицы могут закономерно выбрать sequential scan, поэтому проверка плана не должна трактовать план маленькой fixture как доказательство индексирования.

### 6. Permissions и REST contract

Не передавать все документы или все страницы в память. Search read layer сначала получает агрегированные и упорядоченные уникальные candidate IDs/rank небольшими batches. Минимально расширить `PagePermissionsRepository`/`PagePermissionsService` пакетным разрешением ролей для candidate IDs: использовать ту же рекурсивную цепочку, те же правила owner/nearest permission/`INHERIT`/`RESTRICTED` и те же проверки live page/project, что и `resolveRole`. Поддерживать parity тестом batch resolve против индивидуального `resolveRole`. Только после разрешения Search получает поля результата; закрытый title/snippet не возвращается и не сериализуется в API. Следующая HTTP request снова обращается к permissions read layer без кеша.

REST contract: bearer-authenticated `GET /api/v1/search?query=<text>&limit=<n>`. Query DTO trim-ит `query`; значение длиннее 200 символов после trim отклоняется validation error, пустое значение или значение без FTS-лексем возвращает пустой JSON array. `limit` в query DTO по умолчанию равен 20 и принимает целые значения 1–50; значения вне диапазона или нецелые отклоняются validation error. Response — JSON array элементов DTO `{ pageId, title, snippet }`, где `snippet: string | null`. Не возвращать score, revision fields, полный `plainText`, project metadata, отдельный count или path/breadcrumb. Обычный page read продолжает повторно проверять доступ после navigation. OpenAPI генерирует точный контракт из Nest DTO/decorators, включая bearer authentication, query limits/default и nullable snippet.


### 7. Failure modes и lifecycle

- Ошибка document projection не отклоняет persisted save; она обновляет diagnostic state, сохраняет прежнюю успешную projection и ограничивает retry.
- Missing/stale projection не делает весь API недоступным: поиск по актуальному title работает без body row или с устаревшей body projection; поиск по body и snippet использует только projection с `sourceStorageRevision = PageDocument.storageRevision`.
- Soft delete не требует физического удаления projection: query/permissions исключают удалённые страницу/проект. Restore делает сохранённую projection eligible; если она stale, scheduler её восстановит.
- Недоступный ancestor никогда не добавляется в Search response. MVP не возвращает breadcrumb, чтобы не вводить второй алгоритм фильтрации ancestor metadata.

### Alternatives considered

- **Search-specific Yjs decoder / общий projection API с plainText:** отклонено, так как повторяло бы schema mapping и расширяло бы общий контракт без потребности других consumers.
- **Копировать title в search vector:** отклонено, так как создало бы второй source of truth и потребовало синхронизации при rename.
- **Только `simple` body vector без title expression index:** недостаточно для индексируемого поиска по актуальному title; отдельный expression GIN нужен для масштабирования запросов.
- **Inline projection в persistence request:** отклонено, так как увеличивает latency и связывает сохранение authoritative state с derived processing.
- **Redis/BullMQ/внешний engine или distributed lease:** не оправданы текущей инфраструктурой; PostgreSQL scheduler, bounded retries и revision-safe writes обеспечивают требуемую eventual consistency.
- **Один FTS запрос с ранним global LIMIT до permissions:** отклонено, потому что высокоранжированные закрытые страницы могли бы скрыть доступные совпадения.

## Risks / Trade-offs

- **Нет stemming** → смешанные RU/EN запросы работают единообразно, но поиск словоформ ограничен; multilingual stemming можно пересмотреть отдельным решением при продуктовой необходимости.
- **Scheduler-only indexing имеет eventual delay** → UI не обещает немедленную индексацию последнего символа; retry scan восстанавливает пропущенную работу после рестарта.
- **Несколько instances могут дублировать вычисление** → batch limit ограничивает работу каждого instance, транзакционный revision check делает повтор безопасным.
- **Batch permission resolution расширяет общий read layer** → сохранить единый алгоритм в permissions module и покрыть parity/integration tests, не копировать его в Search.
- **Нет breadcrumb в DTO** → UI #54 показывает title/snippet и navigation target без path; безопасный путь требует отдельного targeted permission-aware read contract.
- **Raw SQL для tsvector/locking сложнее Prisma query API** → оставить SQL локально в search repository и покрыть реальными PostgreSQL integration tests.
- **Прямой `OR` через разные GIN relations может ухудшить план** → раздельные indexable candidate branches объединяются через `UNION ALL`; проверить plan через `EXPLAIN (ANALYZE, BUFFERS)` на репрезентативном объёме.
- **Нет версии алгоритма projection** → `--all` требует единой версии backend workers; одновременный rolling rebuild старой и новой логикой не поддерживается.
- **PostgreSQL недоступен при фиксации retry** → durable backoff временно недоступен; scheduler прекращает batch и ограничивает частоту повторов интервалом/размером batch, но автоматическое восстановление зависит от восстановления БД.

## Migration Plan

Migration additive: создать `PageSearchDocument`, FK cascade, unique page key, поля retry/source revision и GIN indexes. Для новых страниц отсутствие row допустимо до scheduler; query начинает с Page и left join, поэтому title search не зависит от body row. Backfill CLI требуется запускать после deploy либо использовать scheduler для постепенного backfill; оба пути вызывают общий индексатор.

Rollback приложения не удаляет derived rows и индексы. Rollback migration не входит в автоматический deploy path; удаление search table возможно только отдельной согласованной destructive migration. Не добавлять runtime config или новую инфраструктуру.

## Open Questions

Нет блокирующих вопросов. Issue #51 сейчас формулирует missing projection как отсутствие результата до завершения индексации. Принятое здесь решение уточняет контракт: актуальный title searchable сразу, body searchable только после актуальной projection. Минимальная корректировка issue — заменить это условие на: «Если body projection отсутствует или отстаёт, поиск по body для этой страницы временно недоступен; поиск по текущему title продолжает работать». Breadcrumb не включается; UI #54 должен считать path необязательным. Выбор `simple` зафиксирован с известным отсутствием stemming.
