## 1. DB schema и migrations

- [x] 1.1 Добавить Prisma model `PageSearchDocument` с уникальным `pageId`, `plainText`, native `tsvector`, nullable `sourceStorageRevision`, `updatedAt` и ограниченными retry-полями; связать строку с Page через `ON DELETE CASCADE`.
- [x] 1.2 Создать additive PostgreSQL migration для таблицы и constraints, GIN index по body vector и GIN expression index по `to_tsvector('simple', COALESCE(Page.title, ''))`; сохранить conventions текущих quoted Prisma table/column names.
- [x] 1.3 Добавить PostgreSQL integration coverage для уникальности projection на страницу, FK cascade, native `tsvector`, обоих GIN indexes и совместимости query expressions с индексами.

## 2. Plain-text extraction

- [x] 2.1 Реализовать локальный extractor из `DocumentProjection.contentJson`, вызывающий только существующий `projectDocument` для Yjs/schema conversion.
- [x] 2.2 Извлекать текстовые узлы и заданные пользовательские `caption`/`alt`, добавлять читаемые разделители блоков и исключать media URLs, ids, технические attrs и служебную metadata.
- [x] 2.3 Добавить unit tests для абзацев, heading, lists/tasks, marks, соседних text nodes, media captions/alt, исключённых URL/ids/attrs, пустого документа и unsupported/corrupt persisted content.

## 3. Search projection use case

- [x] 3.1 Добавить минимальный repository/use case для построения search row из `PageDocumentRecord`, формирующий body `tsvector` с PostgreSQL `simple` configuration.
- [x] 3.2 Строить projection вне транзакции, затем блокировать `PageDocument` `FOR UPDATE`, повторно проверять revision и атомарно записывать только совпадающую актуальную ревизию; обычная индексация пропускает уже успешную равную revision, forced rebuild допускает обновление равной revision.
- [x] 3.3 Добавить unit tests на идемпотентную повторную обработку, пустой текст, пропуск stale revision, ошибку построения, сохранение предыдущей корректной projection и placeholder с `sourceStorageRevision = NULL` для первой ошибки.
- [x] 3.4 Проверить, что ошибка search indexing не меняет исход успешного Yjs persistence и не выбрасывается из persistence flow.

## 4. Scheduler и retry

- [x] 4.1 Добавить Nest scheduler с bounded batch scan: кандидаты — отсутствующая строка, NULL `sourceStorageRevision` или отставшая revision; вычислять eligibility до LIMIT по `attemptedStorageRevision`, retryAfter, attempt limit и permanent/exhausted state, nullable error state обрабатывать явно.
- [x] 4.2 Добавить capped exponential retry, лимит попыток, permanent/exhausted error state, безопасные диагностические логи и сброс retry для новой authoritative revision.
- [x] 4.3 Проверить scheduler unit tests для batch limit, local re-entry guard, retry timing, placeholder с NULL revision, exhausted/permanent пропуска до LIMIT, starvation avoidance и ошибки scan/retry-state persistence.
- [x] 4.4 Добавить PostgreSQL integration tests для первого failed indexing → placeholder → retry после retryAfter → успешного восстановления; новая authoritative revision сбрасывает блок предыдущей.
- [x] 4.5 Добавить PostgreSQL concurrency integration tests: worker A revision 15 не перезаписывает projection или diagnostics revision 16 от worker B; два worker-а одной revision безопасны; новая authoritative revision, сохранённая во время extraction, блокирует success и failure write старого задания.
- [x] 4.6 Проверить ошибку записи retry state при временной недоступности PostgreSQL: текущий batch прекращён, ошибка ограниченно залогирована, попытка не считается сохранённой и следующие scheduler runs ограничены interval/batch policy.
- [x] 4.7 Проверить несколько backend instances: дублирующая работа допустима, projection не регрессирует, exhausted/permanent документ не вытесняет eligible страницы из batch.

## 5. Backfill и rebuild

- [x] 5.1 Добавить простой `search:rebuild-projection` CLI entrypoint с bounded scan persisted documents; обычный режим пропускает успешно обработанную равную revision, `--all` принудительно обновляет projection при равной revision и сбрасывает retry state при успехе.
- [x] 5.2 Использовать тот же extractor/indexer, failure path и authoritative revision guard, что и scheduler; `--all` не может перезаписать более новую projection старой revision и не декодирует Y.Doc отдельно.
- [x] 5.3 Документировать/обеспечить запуск `--all` только после переключения всех backend workers на одну версию projection algorithm и остановки старых workers; projector version field/поддержка смешанного rolling rebuild остаётся вне scope.
- [x] 5.4 Проверить PostgreSQL integration сценарии первичной индексации существующих документов, повторного запуска, forced rebuild равной revision, rebuild параллельно с редактированием и повреждённого документа с продолжением обработки остальных страниц.
- [x] 5.5 Проверить failure при `--all` на уже успешной равной revision: прежние projection и retry metadata остаются неизменными, ошибка видна в logs и CLI summary/exit result, новый retry state не создаётся, повтор требует следующего явного запуска.

## 6. Search read layer и PostgreSQL FTS

- [x] 6.1 Реализовать параметризованные SQL candidate ветви title и body раздельно, объединённые через `UNION ALL`; body участвует только при равенстве projection revision и `PageDocument.storageRevision`. До permissions filtering и pagination агрегировать обе ветви по `pageId`, сводя match flags/ranks; `simple` expression/query configuration должна совпадать с GIN expressions.
- [x] 6.2 Для `websearch_to_tsquery` проверять `querytree` и возвращать пустой список при пустой/non-indexable положительной части; положительные слова по умолчанию должны совпасть целиком в одном поле, title или body.
- [x] 6.3 Реализовать rank: title matches прежде body-only, затем `GREATEST(title_rank, body_rank) DESC`, затем `pageId ASC`; получать candidate IDs/rank ограниченными batches и продолжать после permissions filtering.
- [x] 6.4 Генерировать `ts_headline` snippet только после проверки permission, с пустыми highlight markers, ограничением 240 символов и plain-text API contract; для title-only/missing/stale body возвращать `null`, не выдавать raw `plainText`.
- [x] 6.5 Добавить PostgreSQL FTS tests для title/body, русского/английского/смешанного query, title ranking, одинакового rank, отсутствия дубликата при совпадении страницы в title и body, split terms across fields, explicit operators, blank/punctuation/negative-only query, limit, rename без reindex и missing/stale projection.
- [x] 6.6 На репрезентативном объёме выполнить `EXPLAIN (ANALYZE, BUFFERS)` для обеих candidate ветвей после `ANALYZE`; проверить GIN index usage и отсутствие раннего общего LIMIT. Зафиксировать план/проверяемое утверждение в тестовом/ревью результате, не требовать GIN от маленькой fixture.

## 7. Permissions integration

- [x] 7.1 Расширить существующий `PagePermissionsService`/repository пакетным разрешением ролей для candidate IDs, переиспользуя `resolveRole` chain semantics; не внедрять permission algorithm в Search module.
- [x] 7.2 Добавить integration parity test: batch permission результат совпадает с индивидуальным `resolveRole` для owner, direct grant, inherited access, ближайшего разрешения и `RESTRICTED` boundary.
- [x] 7.3 Добавить search permission integration tests для собственной страницы, выданного доступа, недоступной страницы, отзыва доступа между запросами, inherited permission и explicit permission на дочернюю страницу закрытого родителя.
- [x] 7.4 Проверить, что недоступные title/snippet/count/path/project metadata не попадают в response, а высокоранжированные закрытые совпадения не вытесняют доступные результаты за итоговый limit.
- [x] 7.5 Проверить soft delete страницы/проекта и последующий restore: удалённые результаты скрыты, после restore актуальный title/body снова доступны без изменения Y.Doc.

## 8. REST API и OpenAPI

- [x] 8.1 Добавить bearer-authenticated `GET /api/v1/search?query=<text>&limit=<n>` с query DTO: trim, validation error при длине больше 200 символов; пустой/no-lexeme query возвращает пустой JSON array. `limit` default 20, целые 1–50, остальные значения дают validation error через существующий Nest `ValidationPipe`.
- [x] 8.2 Добавить минимальный response DTO JSON array с `pageId`, актуальным `title`, nullable plain-text `snippet: string | null`; не включать rank, revisions, полный body, breadcrumb или private metadata.
- [x] 8.3 Добавить controller/read-service wiring и Swagger decorators по существующим conventions, затем обновить OpenAPI и generated API client через штатные команды.
- [x] 8.4 Добавить HTTP integration tests для unauthenticated request, trim/blank/no-lexeme query, rejected query длиннее 200 символов, default limit и границ 1/50, rejected invalid limits, JSON-array response DTO/null snippet, maximum output size, no HTML snippet, no stale fields и следующего page read после отзыва доступа.

## 9. Unit и PostgreSQL integration matrix

- [x] 9.1 Покрыть projection случаи: persisted Y.Doc indexing, корректное извлечение текста, пустой документ, повтор той же revision, out-of-order success и failure, несколько workers, новая persisted revision во время extraction, ошибка projection без ошибки persistence и сохранение предыдущей projection при ошибке.
- [x] 9.2 Покрыть Search API случаи: title/body, title-priority, deterministic ties, blank/invalid/negative-only query, limit, missing/stale projection contract, terms split across fields, mixed languages и safe escaped snippet.
- [x] 9.3 Покрыть permissions/lifecycle: owner, direct access, inaccessible result, revoke, inherited access, explicit child under restricted parent, no metadata leaks, soft delete page/project и restore.
- [x] 9.4 Покрыть backfill/rebuild: первоначальные существующие документы, повторный rebuild, rebuild одновременно с редактированием и повреждённый документ без остановки batch.
- [x] 9.5 Поведение PostgreSQL locking, FTS/indexes, `tsvector`, `ON CONFLICT`, transaction rollback и concurrent revision writes проверять настоящими API integration tests с PostgreSQL; unit mocks не считать доказательством этих гарантий.

## 10. Финальная проверка

- [x] 10.1 Сверить каждый acceptance criterion issue #51 с delta spec и тестом: migration/indexes, title/body, shared projection, revision safety, rename, backfill, bounded API, permissions, soft delete/restore, stale/missing behavior и failure isolation; зафиксировать предложенную issue wording correction для title при отсутствующей body projection.
- [x] 10.2 Проверить, что не добавлены Search-specific Yjs decoder, второй permission algorithm, title source of truth, новая очередь/внешняя инфраструктура, breadcrumb или избыточные abstractions.
- [x] 10.3 Выполнить `openspec validate add-page-full-text-search --strict`, релевантные API lint/typecheck/unit/real PostgreSQL integration tests/build и `pnpm api:check`; отметить task checkboxes только после успешной проверки соответствующей задачи.
