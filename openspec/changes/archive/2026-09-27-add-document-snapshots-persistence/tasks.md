## 1. Схема Prisma

- [x] 1.1 Добавить enum `SnapshotReason` и model `DocumentSnapshot` с UUID-идентификаторами, соответствующими типам FK для `Page`/`User`, бинарным состоянием Yjs, полями происхождения snapshot, nullable creator, временными метками и без `updatedAt`.
- [x] 1.2 Добавить relations `Page.snapshots` и `User.createdSnapshots` с предусмотренным поведением удаления cascade/restrict.
- [x] 1.3 Добавить unique constraint `(pageId, revision)` и indexes `(pageId, revision DESC)`, `(pageId, sourceStorageRevision DESC)` и `(createdById)`.

## 2. Миграция базы данных

- [x] 2.1 Создать именованную Prisma migration для `DocumentSnapshot` и проверить в её SQL enum, таблицу, constraints, foreign keys и indexes.
- [x] 2.2 Проверить схему и перегенерировать Prisma Client, не добавляя generated output в коммит.

## 3. Проверки

- [x] 3.1 Выполнить strict OpenSpec validation, Prisma validate/generate, lint репозитория, API typecheck, релевантные tests и существующую API build-команду.
- [x] 3.2 Убедиться, что change не содержит trigger или database-level запрета UPDATE, snapshot creation service, API route, restore flow, scheduler, rendering, publication или изменений frontend.
