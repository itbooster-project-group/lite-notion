## 1. Схема базы данных

- [x] 1.1 Добавить в `packages/database/prisma/schema.prisma` enum `PageAccessMode` (`INHERIT`, `RESTRICTED`), enum `PagePermissionRole` (`VIEWER`, `EDITOR`) и поле `Page.accessMode` с default `INHERIT`; проверить `pnpm --filter @lite-notion/database prisma:generate` и появление типов в `packages/database/src/generated/prisma/enums.ts`
- [x] 1.2 Добавить модель `PagePermission` (`pageId`, `userId`, `role`, `grantedById`, `createdAt`, `updatedAt`) с PK `(pageId, userId)`, каскадом по `pageId` и `userId`, `Restrict` по `grantedById` и индексом `(userId, pageId)`; проверить генерацию клиента и появление `packages/database/src/generated/prisma/models/PagePermission.ts`
- [x] 1.3 Создать миграцию `pnpm --filter @lite-notion/database db:migrate:dev`; проверить, что она применяется на пустой и на непустой базе и существующие страницы получают `accessMode = INHERIT`
- [x] 1.4 Обновить раздел Page permissions в `docs/database-schema.md`: отметить `PAGE_PERMISSIONS` и `PAGES.access_mode` как реализованные и привести фактические имена колонок; проверить чтением диффа

## 2. Общий пакет `@lite-notion/page-permissions`

- [x] 2.1 Создать `packages/page-permissions` (манифест, `tsconfig.json`, `vitest.config.mts`, экспорт из `src/index.ts`) с зависимостью только на `@lite-notion/database`; проверить `pnpm --filter @lite-notion/page-permissions typecheck` и запись пакета в `pnpm-lock.yaml`
- [x] 2.2 Реализовать `src/roles.ts`: тип `PageRole` со значениями `viewer`, `editor`, `owner` и `roleAtLeast`; проверить `roles.spec.ts`, покрывающим порядок ролей и включение `viewer` в `editor`
- [x] 2.3 Реализовать `src/effective-role.ts` — `resolveEffectiveRole(prisma, userId, pageId)` рекурсивным CTE подъёма из design.md, принимающий клиент параметром; проверить `effective-role.spec.ts` без базы на подставленных строках цепочки: владелец, прямое разрешение, наследование, граница `restricted`, прямое разрешение на `restricted`-странице, ближайшее против дальнего, пустая цепочка
- [x] 2.4 Реализовать `src/accessible-pages.ts` — `findAccessiblePages(prisma, userId)` рекурсивным CTE спуска из design.md, возвращающий плоский список с ролью; проверить типизацией и интеграционным тестом ниже
- [x] 2.5 Написать `effective-role.integration-spec.ts` на реальной базе: подъём сквозь несколько уровней `inherit`, остановка на `restricted`, прямое разрешение на `restricted`-странице, ближайшее разрешение против дальнего, удалённая страница, удалённый проект; проверить `pnpm --filter @lite-notion/page-permissions test:integration`
- [x] 2.6 Написать тест-свойство согласованности двух запросов: для каждой страницы из `findAccessiblePages` вызвать `resolveEffectiveRole` и сравнить роль; проверить, что расхождений нет ни на одном узле дерева с границей `restricted` и вложенным собственным разрешением
- [x] 2.7 Добавить job для `packages/*` в `.github/workflows/ci.yml` с сервисом Postgres, применением миграций и запуском typecheck, test и test:integration пакета; проверить, что job падает при намеренно сломанном тесте пакета

## 3. Nest-обёртка в API

- [x] 3.1 Создать `apps/api/src/page-permissions/`: модуль, репозиторий разрешений и `PagePermissionsService.resolveRole`, делегирующий в пакет и умеющий работать на клиенте транзакции через `bind(scope)`; проверить, что модуль поднимается в тесте приложения без `forwardRef` и без импорта `PagesModule`
- [x] 3.2 Добавить `PagePermissionsService.requireRole(userId, pageId, minRole)`, бросающий `PageNotFoundError` при отсутствии доступа и `PageRoleInsufficientError` при нехватке роли; проверить unit-тестом, что при отсутствии доступа `PageRoleInsufficientError` не бросается никогда
- [x] 3.3 Добавить `PageRoleInsufficientError` в `apps/api/src/pages/errors.ts` с комментарием о единственном разрешённом случае `403`; проверить типизацией
- [x] 3.4 Добавить ветку для неё в `toHttpException` в `apps/api/src/pages/helpers.ts`; проверить `pages/helpers.spec.ts`, что она даёт `403` в едином формате HTTP-ошибок, а `PageNotFoundError` по-прежнему даёт `404` с прежним телом

## 4. Перевод операций страниц на роли

- [x] 4.1 Добавить в `PagesRepository` метод `findLiveById(id)` и снять комментарий о намеренном отсутствии метода без владельца, заменив его на условие безопасного использования; проверить, что owner-scoped методы корзины и восстановления остались нетронутыми
- [x] 4.2 Перевести `PagesService.findById` на `requireRole(…, viewer)` и убрать `ownerId` из `PagesService.rename` и `PagesRepository.rename`, добавив в переименование проверку `editor`; проверить обновлённым `pages.service.spec.ts`
- [x] 4.3 Перевести `CreatePageUseCase`: при указанном родителе — проверка `editor` на родителе, наследование `ownerId` и `projectId` от него, `createdById` — актор, блокировка по `parent.ownerId` с перепроверкой роли под блокировкой; создание root-страницы остаётся операцией владельца проекта; проверить unit-тестами юзкейса
- [x] 4.4 Перевести `MovePageUseCase` на `requireRole(…, owner)` для перемещаемой страницы, её текущего родителя и нового родителя, сохранив прежние коды отказов для соседей и циклов; проверить обновлённым `pages.service.spec.ts` и `move-adjacency.integration-spec.ts`
- [x] 4.5 Перевести `SoftDeletePageUseCase` на `requireRole(…, owner)`, сохранив `404` для недоступной и уже удалённой страницы; проверить unit-тестами юзкейса
- [x] 4.6 Добавить `accessMode` и `accessRole` в `PageDto` и `PageTreeNodeDto` и заполнить их во всех операциях страниц; проверить `pages.controller.spec.ts`
- [x] 4.7 Расширить `apps/api/src/pages/access-isolation.http.spec.ts`: для каждой операции — недоступная против несуществующей страницы дают одинаковые `404`, а видимая страница с нехваткой роли даёт `403`; проверить `pnpm --filter @lite-notion/api test`
- [x] 4.8 Написать `create-concurrency` сценарий для двух одновременных созданий дочерней страницы разными редакторами под одним родителем; проверить, что ранги различаются, `pnpm --filter @lite-notion/api test:integration`

## 5. Перевод документов страниц на роли

- [x] 5.1 Перевести `PageDocumentService.read` на `requireRole(…, viewer)`, а `replace` — на `requireRole(…, editor)`, убрав `ownerId` из запросов `PageDocumentRepository`; проверить обновлённым `page-document.service.spec.ts`
- [x] 5.2 Добавить `403` в Swagger-описание записи документа и обновить `page-document.controller.ts`; проверить `page-document.controller.spec.ts`
- [x] 5.3 Расширить `page-document.http.spec.ts`: чтение читателем — `200`, запись читателем — `403` без изменения содержимого, документ недоступной и несуществующей страницы — одинаковый `404`; проверить `pnpm --filter @lite-notion/api test`

## 6. Перевод collaboration на общую модель

- [x] 6.1 Добавить `@lite-notion/page-permissions` в зависимости `apps/collaboration` и в его `prebuild`/`pretest`/`pretypecheck` рядом с существующими сборками пакетов; проверить `pnpm --filter @lite-notion/collaboration typecheck`
- [x] 6.2 Переписать `apps/collaboration/src/documents/page-access.ts`: роль вычисляется общим пакетом, `canWrite` выводится через `roleAtLeast(role, editor)`, проверка наличия `PageDocument` сохраняется, `PageAccessDeniedError` остаётся одним на все причины отказа; проверить, что собственного запроса по `ownerId` в файле не осталось
- [x] 6.3 Обновить `page-access.spec.ts`: `viewer` даёт `canWrite: false`, `editor` и владелец — `true`, отсутствие доступа — `PageAccessDeniedError`; проверить, что старое ожидание `findFirst` с `ownerId` заменено, а не оставлено рядом
- [x] 6.4 Убедиться, что `collaboration-server.ts` не требует правок сверх источника `canWrite`, и что persistence hooks не переавторизуют пользователя; проверить `collaboration-server.spec.ts`
- [x] 6.5 Написать `page-access.integration-spec.ts` по образцу `persistence.integration-spec.ts`: читатель подключается, но его update не сохраняется; редактор подключается и его update сохраняется; страница за границей `restricted` и страница удалённого проекта отклоняются; проверить `pnpm --filter @lite-notion/collaboration test:integration`

## 7. Операции управления доступом

- [x] 7.1 Добавить в репозиторий разрешений методы upsert, удаления и чтения списка по странице; проверить, что повторный upsert меняет роль и не создаёт вторую строку, `test:integration`
- [x] 7.2 Создать DTO в `apps/api/src/page-permissions/dto/`: тело выдачи (email, роль), представление разрешения (пользователь, email, имя, роль, метки), тело переключения режима; проверить unit-тестами валидации на недопустимую роль, некорректный email и лишнее поле
- [x] 7.3 Реализовать `GrantPagePermissionUseCase`: проверка `owner`, разрешение email в пользователя по правилам нормализации из `auth`, отказ `400` при выдаче владельцу, отказ `404` при незарегистрированном email; проверить unit-тестами юзкейса
- [x] 7.4 Реализовать отзыв разрешения и чтение списка разрешений страницы с проверкой `owner` и детерминированным порядком; проверить unit-тестами
- [x] 7.5 Реализовать переключение режима наследования с проверкой `owner` и идемпотентностью; проверить, что операция не трогает заголовок, родителя, ранг и прямые разрешения
- [x] 7.6 Создать `PagePermissionsController` с префиксом `pages/:pageId` и Swagger-описаниями всех четырёх операций, включая `403` и `404`; проверить `page-permissions.controller.spec.ts`
- [x] 7.7 Написать `page-permissions.http.spec.ts`: выдача, изменение роли, отзыв, чтение списка, переключение режима, отказы `403` редактору и `404` постороннему; проверить `pnpm --filter @lite-notion/api test`

## 8. Выдача доступных страниц

- [x] 8.1 Собрать выдачу существующим `assembleTree` поверх `findAccessiblePages` со своим `compareRoots` по заголовку и `id`; проверить unit-тестом детерминированности порядка и отсутствия дублей у страницы с собственным разрешением внутри доступного поддерева
- [x] 8.2 Объявить `GET /api/v1/pages/shared` в `PagesController` выше обработчика `:pageId`, рядом с `trash`; проверить http-специей, что маршрут не перехватывается параметрическим и отвечает `200` с пустым списком при отсутствии разрешений
- [x] 8.3 Написать http-специю выдачи: чужое поддерево с ролью в каждом узле, отсутствие собственных страниц, обрезка на `restricted`, исчезновение удалённого; проверить `pnpm --filter @lite-notion/api test`

## 9. Контракт и проверки

- [x] 9.1 Перегенерировать контракт `pnpm api:generate` и проверить отсутствие drift командой `pnpm api:check`
- [x] 9.2 Прогнать проверки приложений: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- [x] 9.3 Прогнать интеграционные наборы, которые CI не покрывает: `pnpm --filter @lite-notion/api test:integration` и `pnpm --filter @lite-notion/collaboration test:integration`
- [x] 9.4 Проверить соответствие реализации спецификациям: `openspec validate add-page-permissions --type change --strict`
