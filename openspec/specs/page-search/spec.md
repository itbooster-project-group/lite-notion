# Page Search Specification

## Purpose

Поиск позволяет находить страницы по актуальному названию и тексту последнего успешно сохранённого Y.Doc, показывая результаты только пользователям с effective permission.

## Requirements

### Requirement: Search projection reflects persisted document content

Система MUST поддерживать не более одной восстанавливаемой search projection для каждой страницы. Она MUST извлекать пользовательский текст из persisted Y.Doc через существующий schema-aware document projection и хранить обработанную `storageRevision`. Search projection MUST оставаться derived data, а authoritative содержимым MUST оставаться persisted Y.Doc.

#### Scenario: Persisted document is indexed
- **WHEN** для страницы успешно сохранена новая ревизия Y.Doc
- **THEN** система в конечном итоге сохраняет извлечённый текст и соответствующую `storageRevision` в search projection

#### Scenario: Empty persisted document is processed
- **WHEN** индексатор обрабатывает сохранённый пустой документ
- **THEN** он сохраняет пустой текст и отмечает текущую ревизию обработанной

#### Scenario: Projection extracts only document text
- **WHEN** индексатор извлекает текст из document projection
- **THEN** результат содержит текстовые узлы и видимые подписи документа, но не внутренние идентификаторы, технические attrs, служебные metadata или URL вложений

### Requirement: Search projection writes are revision-safe

Система MUST выполнять индексацию идемпотентно и MUST NOT позволять старой или устаревшей по отношению к authoritative документу ревизии перезаписать более новую projection. Ошибка индексации MUST NOT отклонять успешное сохранение Y.Doc или уничтожать предыдущую корректную projection.

#### Scenario: Duplicate processing of one revision
- **WHEN** одна и та же persisted revision обрабатывается повторно
- **THEN** повторная запись безопасна и не создаёт несколько projections страницы

#### Scenario: Older job finishes after newer job
- **WHEN** worker с revision 15 заканчивает после worker с revision 16
- **THEN** projection revision 16 остаётся сохранённой

#### Scenario: Authoritative document changes while projection is built
- **WHEN** новая storage revision сохраняется после чтения Y.Doc worker-ом, но до записи его projection
- **THEN** worker не записывает результат старого состояния

#### Scenario: Projection construction fails
- **WHEN** schema-aware projection или сохранение search projection завершается ошибкой
- **THEN** Yjs persistence остаётся успешным, предыдущая корректная projection сохраняется, а сбой допускает диагностику и повторную обработку по retry policy

#### Scenario: Stale worker fails after newer projection succeeds
- **WHEN** worker A обрабатывает revision 15, worker B успешно записал revision 16, а затем worker A записывает failure state
- **THEN** projection 16 и её retry/diagnostic state остаются неизменными

#### Scenario: Retry state cannot be written for a changed authoritative revision
- **WHEN** authoritative storage revision меняется во время построения или обработки ошибки
- **THEN** транзакционная проверка revision не позволяет старому worker-у менять projection или диагностическое состояние новой ревизии

### Requirement: Stale projections are retried and existing documents can be rebuilt

Система MUST обнаруживать отсутствующие и отстающие projections, включая placeholder с NULL `sourceStorageRevision`, ограничивать размер одной обработки и применять retry/backoff до LIMIT. Permanent/exhausted revisions MUST NOT занимать batch и блокировать другие документы. Backfill и rebuild MUST читать persisted Y.Doc и использовать ту же логику извлечения/записи, что и обычная индексация.

#### Scenario: Scheduler finds an absent or stale projection
- **WHEN** у страницы отсутствует search projection либо её `sourceStorageRevision` меньше `PageDocument.storageRevision`
- **THEN** scheduler в конечном итоге планирует актуальную persisted revision для обработки ограниченной batch-операцией

#### Scenario: Placeholder remains eligible after retry delay
- **WHEN** placeholder имеет NULL `sourceStorageRevision`, `attemptedStorageRevision` равен текущей revision и `retryAfter` наступил
- **THEN** scheduler включает документ в batch с учётом attempt limit и permanent/exhausted state

#### Scenario: New authoritative revision clears previous retry block
- **WHEN** authoritative revision стала новее revision с exhausted/permanent failure
- **THEN** новая revision снова eligible, а её попытки учитываются отдельно от предыдущей

#### Scenario: Retry limit is reached
- **WHEN** обработка одной ревизии многократно завершается ошибкой
- **THEN** система прекращает автоматические попытки для этой ревизии до её изменения или явного rebuild

#### Scenario: Existing documents are backfilled repeatedly
- **WHEN** оператор запускает backfill/rebuild один или несколько раз
- **THEN** существующие документы индексируются из persisted Y.Doc, а повторный запуск безопасен и не позволяет старой ревизии затереть новую

#### Scenario: Forced rebuild reprocesses the same revision
- **WHEN** оператор запускает `--all` для страницы, у которой текущая revision уже успешно проиндексирована
- **THEN** та же revision принудительно проходит текущую логику projection, retry state сбрасывается при успехе, а более новая revision не может быть затёрта

#### Scenario: Forced rebuild fails for an already indexed revision
- **WHEN** `--all` не может построить projection для равной revision, для которой уже есть успешная projection
- **THEN** предыдущие projection и retry metadata сохраняются, ошибка отражается в logs и результате CLI, новый retry state не создаётся, повтор выполняется при следующем явном запуске

#### Scenario: Retry state persistence fails
- **WHEN** PostgreSQL не сохраняет retry/failure state
- **THEN** worker не считает retry зафиксированным, прекращает текущий batch и ограничивает повторную работу scheduler interval/batch policy

### Requirement: Search matches current title and current indexed body text

Система MUST искать по текущему `Page.title` и по тексту search projection, соответствующей текущей storage revision. Каждая FTS lexeme MUST поддерживать prefix matching с начала слова в title и body, в том числе при отсутствии/отставании body projection для title match. Body MUST использовать только актуальную projection. Title MUST иметь более высокий приоритет, чем совпадение только в body. Поиск MUST поддерживать русский, английский, цифры и смешанные запросы без внешнего search engine. Prefix преобразование MUST выполняться над результатом parameterized `websearch_to_tsquery`, не вставлять сырой пользовательский ввод в SQL и сохранять разбор multi-term AND, `OR`, отрицаний и quoted phrase; другие специальные символы обрабатываются существующим PostgreSQL websearch parser. Морфологический, fuzzy, trigram и semantic search не входят в эту capability.

#### Scenario: Search matches title and body
- **WHEN** авторизованный пользователь ищет уникальный термин из названия или актуального текста доступной страницы
- **THEN** Search API возвращает соответствующую страницу

#### Scenario: Complete word and prefix match a title without body projection
- **GIVEN** текущий title страницы — `Документация проекта`, а body projection отсутствует
- **WHEN** пользователь ищет `Документация`, `Докумен` или `проек`
- **THEN** каждый запрос находит страницу по title без требования к body projection

#### Scenario: Prefix matching applies to document headings and paragraphs
- **GIVEN** актуальная projection содержит TipTap heading H1–H6 и paragraph с обычными/вложенными text nodes
- **WHEN** пользователь ищет начало слова из одного из этих блоков
- **THEN** страница находится тем же prefix matching, что и при поиске по title

#### Scenario: Multi-term prefix matching preserves websearch operators
- **GIVEN** актуальные title/body содержат подходящие lexemes
- **WHEN** запрос содержит несколько prefix terms, `OR`, отрицательный term или quoted phrase
- **THEN** каждый term допускает prefix match, а объединение, исключение и phrase adjacency сохраняют семантику `websearch_to_tsquery`

#### Scenario: Special query syntax is parameterized and bounded by the parser
- **WHEN** query содержит кириллицу, латиницу, цифры, кавычки, пунктуацию или SQL-подобный текст
- **THEN** он передаётся как параметр, PostgreSQL разбирает только `websearch_to_tsquery` syntax, и произвольный ввод не становится SQL/tsquery-кодом

#### Scenario: Title match ranks above body-only match
- **WHEN** одинаковый термин встречается в title одной страницы и только в body другой
- **THEN** страница с совпадением title располагается выше

#### Scenario: Rename changes title search without document reindex
- **WHEN** страница переименована, а Y.Doc не менялся
- **THEN** поиск использует новое название без ожидания новой document projection

#### Scenario: Russian, English and mixed-language terms
- **WHEN** запрос содержит русские, английские или смешанные токены
- **THEN** PostgreSQL FTS обрабатывает токены одной согласованной конфигурацией и ищет их в title и body

#### Scenario: A page matches in both title and body
- **WHEN** одна страница соответствует query и по title, и по актуальному body
- **THEN** после объединения и агрегации candidate ветвей страница появляется в ответе не более одного раза с title priority и стабильным rank

#### Scenario: Positive terms split across title and body
- **WHEN** некавычные положительные слова многословного запроса совпадают только распределённо между title и body, но не все совпадают внутри любого одного поля
- **THEN** страница не соответствует запросу; явные операторы `websearch_to_tsquery` сохраняют свою штатную семантику

#### Scenario: Query contains no searchable lexemes
- **WHEN** query пуст, состоит из пробелов или после FTS-разбора не содержит лексем
- **THEN** API возвращает пустой набор результатов без ошибки

#### Scenario: Query contains only negative terms
- **WHEN** query содержит только отрицательные термины и не имеет положительной indexable части
- **THEN** API возвращает пустой список без запуска неограниченного FTS scan

### Requirement: Search responses are bounded and deterministic

Search API MUST предоставлять bearer-authenticated `GET /api/v1/search?query=<text>&limit=<n>`. Query MUST обрезаться по краям; значение длиннее 200 символов после trim MUST отклоняться validation error. `limit` MUST иметь default 20, принимать целые значения 1–50 и отклонять иные значения validation error. Пустой query и query без полезных FTS-лексем MUST возвращать пустой JSON array. Успешный response MUST быть JSON array DTO `{ pageId, title, snippet }`, где `snippet` имеет тип `string | null`. API MUST ограничивать число результатов, MUST использовать стабильный порядок с детерминированным tie-breaker и MUST NOT возвращать полный `plainText`, storage revision или внутреннюю metadata. Snippet MUST строиться только для уже разрешённых страниц, быть ограниченным plain text и содержать только контекст доступной страницы. HTML markers отключаются; потребитель MUST отображать snippet с escaping как текст, не как HTML.

#### Scenario: Search results are limited and ordered
- **WHEN** query находит больше страниц, чем заданный limit
- **THEN** API возвращает не больше максимального числа результатов в стабильном порядке

#### Scenario: Search REST contract is applied
- **WHEN** authenticated client отправляет валидный запрос к `/api/v1/search`
- **THEN** API trim-ит query, применяет границу 200 символов и default/range limit 20/1–50 и возвращает массив с `pageId`, текущим `title` и `snippet` типа `string | null`

#### Scenario: Snippet is plain bounded text
- **WHEN** результат содержит совпадение в body
- **THEN** API возвращает не более 240 символов plain-text snippet без HTML highlighting markers, а клиент отображает его с escaping

#### Scenario: Missing or stale body projection
- **WHEN** body projection отсутствует или отстаёт от текущего `storageRevision`
- **THEN** запрос не завершается ошибкой, body не участвует в поиске до актуализации, а поиск по текущему title продолжает работать

#### Scenario: Body revision changes after candidate selection
- **WHEN** body-only кандидат найден по projection, но к финальному чтению `sourceStorageRevision` уже не равен `PageDocument.storageRevision`
- **THEN** страница исключается из результатов; актуальное совпадение title по-прежнему может вернуть страницу, но устаревший body не используется для snippet

### Requirement: Search results obey effective permissions

Search API MUST применять актуальные effective permissions к кандидатам до выбора итогового limit и до выдачи title/snippet. Он MUST учитывать ownership, direct и inherited permissions, `RESTRICTED` boundaries, soft-deleted страницы и проекты. Search MUST NOT реализовывать независимый permission algorithm.

#### Scenario: Owner and explicitly granted user can search a page
- **WHEN** владелец или пользователь с прямым доступом ищет совпадающую страницу
- **THEN** результат включается в выдачу

#### Scenario: Inherited access follows effective-permission rules
- **WHEN** пользователь имеет унаследованный доступ к странице через цепочку `INHERIT`
- **THEN** страница включается в выдачу с теми же правилами effective role, что и обычное чтение страницы

#### Scenario: Explicit access inside a restricted hierarchy
- **WHEN** пользователь имеет прямое разрешение на дочернюю страницу под закрытым родителем
- **THEN** доступная дочерняя страница может появиться в выдаче, а закрытый родитель не раскрывается

#### Scenario: Access is revoked between requests
- **WHEN** доступ отозван после одного запроса Search и пользователь отправляет следующий запрос
- **THEN** следующий ответ уже не содержит страницу, её title, snippet или metadata

#### Scenario: Permission and result metadata share a request snapshot
- **WHEN** Search проверяет effective roles и читает title/snippet кандидатов из одного или нескольких batches
- **THEN** все операции выполняются в одном PostgreSQL `REPEATABLE READ` snapshot через существующий permissions layer; отзыв, committed до начала согласованного чтения, исключает страницу, а изменение после начала snapshot учитывается следующим Search request

#### Scenario: Inaccessible matches precede accessible matches
- **WHEN** FTS-совпадения недоступных страниц имеют более высокий rank, чем совпадения доступных страниц
- **THEN** API продолжает проверку кандидатов и возвращает доступные результаты до достижения разрешённого limit

### Requirement: Soft delete and restore control search eligibility

Soft-deleted страницы и проекты MUST отсутствовать в результатах даже при сохранённой projection. После штатного restore страница MUST снова становиться eligible без ручного редактирования Y.Doc.

#### Scenario: Soft-deleted page or project is hidden
- **WHEN** совпадающая страница или её проект находится в корзине
- **THEN** Search API не возвращает результат и не раскрывает связанное количество или metadata

#### Scenario: Restored page becomes searchable
- **WHEN** существующая страница восстановлена штатным restore flow
- **THEN** она снова может появиться по актуальному title и обработанной body projection без изменения Y.Doc
