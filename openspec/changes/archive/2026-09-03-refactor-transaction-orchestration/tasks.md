## 1. Инфраструктура транзакции

- [x] 1.1 Объявить построитель `ownerLock` в `common/helpers.ts` — единственный источник ключей блокировки; проверить `pnpm --filter @lite-notion/api typecheck` и зелёный `helpers.spec.ts`
- [x] 1.2 Реализовать `database/transaction.ts` — `DatabaseClient`, `LockKey`, `TransactionScope`, `PrismaTransactionScope`, `TransactionRunner`; проверить юнит-тестом, что `lock` выполняет `pg_advisory_xact_lock` с ожидаемым ключом
- [x] 1.3 Реализовать `database/transaction.in-memory.ts` с no-op локом; проверить юнит-тестом, что `run` вызывает операцию со скоупом и возвращает её результат
- [x] 1.4 Зарегистрировать `TransactionRunner` в `DatabaseModule` и подменить его in-memory версией в `testing/http-application.ts`; проверить, что `pnpm --filter @lite-notion/api test` зелёный без единой правки существующих тестов

## 2. Модуль projects

- [x] 2.1 Перевести `ProjectsRepository` и его двойник на `client: DatabaseClient` с методом `bind(scope)`, не перенося логику; проверить зелёный `pnpm --filter @lite-notion/api test`
- [x] 2.2 Мягкое удаление проекта: разложить репозиторий на `markDeleted` и `markPagesDeletedByProject`, завести `SoftDeleteProjectUseCase` с локом владельца, переключить контроллер; проверить зелёные `projects.http.spec.ts` и `projects.service.spec.ts`
- [x] 2.3 Восстановление проекта: разложить репозиторий на `clearDeleted` и `clearPagesDeletedByProject`, завести `RestoreProjectUseCase`, решение о `404` поднять в юзкейс; проверить зелёные `projects.http.spec.ts` и `projects-trash.http.spec.ts`, а в `trash.integration-spec.ts` перевести вызовы восстановления проекта на юзкейс
- [x] 2.4 Окончательное удаление проекта: вынести перечень обречённых страниц в запрос `findSelfDeletedPageTitles`, решение о подтверждении — в `PurgeProjectUseCase`; проверить зелёный `projects-trash.http.spec.ts` в части `409` без подтверждения и успеха с ним; в `trash.integration-spec.ts` и `create-under-deleted.integration-spec.ts` перевести вызовы окончательного удаления проекта на юзкейс
- [x] 2.5 Очистка корзины проектов: вынести `findDeletedIdsByOwner` и `deleteManyByIds`, завести `PurgeProjectsTrashUseCase`; проверить зелёный `projects-trash.http.spec.ts` и `projects-trash.service.spec.ts`
- [x] 2.6 Дать `ProjectsRepository` чтение проекта вместе с отметкой удаления (`findAnyByIdForOwner`) и экспортировать репозиторий наружу модуля: юзкейсы страниц обращаются к нему напрямую, без прослойки в сервисе; проверить `typecheck`
- [x] 2.7 Убрать из `projects.repository.in-memory.ts` доменные ошибки и правила, оставив эмуляцию хранилища; проверить, что `grep "throw new .*Error" projects.repository*.ts` пуст и HTTP-тесты проектов зелёные

## 3. Модуль pages

- [x] 3.1 Перевести `PagesRepository` и его двойник на `client: DatabaseClient` с методом `bind(scope)`, не перенося логику; проверить зелёный `pnpm --filter @lite-notion/api test`
- [x] 3.2 Создание страницы: свести репозиторий к `insert` и `findLastPositionAtLevel`, завести `CreatePageUseCase` с локом владельца, проверкой проекта через `ProjectsRepository` и вставкой пустого документа через `PageDocumentRepository` — вместо нынешней двойной валидации; той же задачей перевести `create-concurrency.integration-spec.ts` и `create-under-deleted.integration-spec.ts` на юзкейс — лок теперь берёт он, и на репозитории эти тесты зеленели бы, ничего не проверяя; убедиться, что ни одно `expect` в них не изменилось
- [x] 3.3 Перемещение страницы: вынести `findAncestorIds`, `findSiblingForOwner`, `countSiblingsBetween`, `reparent`, поднять правила цикла, совпадения проекта, порядка и смежности соседей в `MovePageUseCase`; проверить зелёные `position-collation.integration-spec.ts` и `pages.http.spec.ts` без правок в них — первый работает сырым `pg`-клиентом и репозитория не касается
- [x] 3.4 Мягкое удаление страницы: вынести `markSubtreeDeleted`, решение о `404` поднять в `SoftDeletePageUseCase`; в `trash.integration-spec.ts` перевести вызовы мягкого удаления на юзкейс, сохранив утверждения; проверить зелёные `trash.integration-spec.ts` и `pages-trash.http.spec.ts`
- [x] 3.5 Восстановление страницы: вынести `findDeletedForOwner`, `moveSubtreeToProject`, `clearSubtreeDeletion`, поднять выбор проекта назначения и правило подъёма в корень в `RestorePageUseCase`; в `trash.integration-spec.ts` перевести вызовы восстановления на юзкейс, оставив проверки CTE, enum и FK-каскадов на репозитории; убедиться, что ни одно `expect` не изменилось
- [x] 3.6 Окончательное удаление страницы: вынести `findSelfDeletedDescendantTitles` и `deleteById`, решение о подтверждении поднять в `PurgePageUseCase`; в `trash.integration-spec.ts` перевести на юзкейс вызовы окончательного удаления и утверждение об отказе без подтверждения — решение теперь принимает юзкейс; проверить зелёный `pages-purge.http.spec.ts`
- [x] 3.7 Очистка корзины страниц: завести `PurgePagesTrashUseCase` с транзакцией и локом владельца поверх `deleteAllDeletedByOwner`; покрыть новые сценарии спецификации — отказ в середине очистки не оставляет частичного результата, очистка и мягкое удаление не пересекаются — интеграционным тестом на живой базе
- [x] 3.8 Свести `PagesService` к чтениям, сборке дерева и корзины, `rename` и `requireOwnedPage`; переключить `PagesController` на юзкейсы и обновить `providers` в `pages.module.ts`, оставив `exports` неизменным; проверить зелёный `page-document.http.spec.ts` как доказательство, что контракт для зависимого модуля не изменился
- [x] 3.9 Убрать из `pages.repository.in-memory.ts` доменные ошибки и правила, оставив эмуляцию хранилища; проверить, что `grep "throw new .*Error" pages.repository*.ts` пуст и `access-isolation.http.spec.ts` зелёный

## 4. Сверка и документация

- [x] 4.1 Проверить грепом критерии из design — Goals: ни одного `throw new *Error` ни в одном `*.repository*.ts`, ни одного `$transaction` вне `database/transaction.ts` и `auth.repository.ts`, ни одного `pg_advisory_xact_lock` вне `database/transaction.ts`, ни одного обращения `tx.project` из репозитория страниц
- [x] 4.2 Удалить осиротевшие приватные методы и неиспользуемые импорты обоих репозиториев; проверить `pnpm lint` и `pnpm typecheck`
- [x] 4.3 Дополнить `apps/api/AGENTS.md` разделом о владении транзакцией, единственной блокировке и критерии появления юзкейса; проверить, что раздел называет `TransactionRunner` и `ownerLock` как единственные точки, где эти правила закреплены
- [x] 4.4 Прогнать полный набор проверок: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` и интеграционные тесты на поднятой через `pnpm dev:api` базе; убедиться, что ни один интеграционный тест не потребовал правок
- [x] 4.5 Прогнать `openspec validate refactor-transaction-orchestration --strict` и убедиться, что дельта `page-tree` принимается

## 5. Правки по итогам ревью

- [x] 5.1 Убрать уровневую блокировку и ранговую машинерию: мутациями на живой базе показать, что ни один юзкейс не обходится одной уровневой, а лок владельца нужен всем трём
- [x] 5.2 Перенести обращения к чужим таблицам в репозитории их агрегатов и развязать цикл модулей `pages` и `projects` через `forwardRef`; проверить грепом, что каждый репозиторий трогает только свою таблицу
- [x] 5.3 Различить отказы перемещения по идентификатору из тела запроса, сохранив неразличимость чужой, удалённой и несуществующей записи внутри каждого; покрыть юнит-тестами
- [x] 5.4 Проверять смежность соседей при перемещении запросом `countSiblingsBetween`: порядка и общего родителя мало, между ними может стоять третий брат
- [x] 5.5 Закрыть двойники тестами на привязку к скоупу: юзкейс, забывший `bind(scope)`, обязан ронять тест; проверить мутацией
