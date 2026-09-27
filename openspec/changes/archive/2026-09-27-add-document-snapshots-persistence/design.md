## Context

Текущая Prisma schema хранит authoritative binary Yjs state в `PageDocument`. Физические таблицы и колонки создаются из Prisma-моделей с PascalCase/camelCase (`PageDocument`), тогда как `docs/database-schema.md` использует uppercase/snake_case как логическую нотацию для ещё не мигрированных сущностей.

## Goals / Non-Goals

**Goals:**

- Добавить минимальную Prisma-модель и PostgreSQL migration для append-only document snapshots.
- Сохранить provenance через `sourceStorageRevision` без вмешательства в `PageDocument` write path.
- Обеспечить FK, revision uniqueness и индексы истории, source revision и creator FK.

**Non-Goals:**

- Вычисление revision, locking или concurrency control.
- Чтение Y.Doc, создание snapshots, restore, scheduler и publication flow.
- API, collaboration hooks, rendering, frontend и новые зависимости.

## Decisions

- **Physical naming:** использовать модель `DocumentSnapshot` без `@@map`. Это продолжает фактическую convention Prisma schema; `DOCUMENT_SNAPSHOTS` из документации является логическим именем.
- **Identifiers and scalar types:** следовать текущей UUID convention: `id String @id @default(uuid()) @db.Uuid`, а `pageId String @db.Uuid` и nullable `createdById String? @db.Uuid` должны совпадать с типом FK targets. Использовать camelCase поля текущей schema; `revision` и `sourceStorageRevision` — `BigInt`, `yjsState` — Prisma `Bytes`/PostgreSQL `BYTEA`, `createdAt` — `DateTime @default(now())`.
- **Creator nullability:** `createdById` nullable, потому что в текущей системе нет system user/service account, но automatic/publication snapshots могут быть system-generated. Non-null user references используют `Restrict`, как `Page.createdBy` и `PagePermission.grantedBy`, чтобы не терять audit identity.
- **Page lifecycle:** relation `Page.snapshots` использует `Cascade`, как `Page.document`; snapshots принадлежат lifecycle страницы.
- **PageDocument relation:** не добавлять Prisma relation через `sourceStorageRevision`: это не уникальный key и не FK, а provenance value. Snapshot всё равно связан с той же страницей через `pageId`.
- **Indexes:** добавить explicit indexes `(pageId, revision DESC)`, `(pageId, sourceStorageRevision DESC)` и `(createdById)` для nullable creator FK; unique `(pageId, revision)` остаётся отдельным constraint.
- **Immutability semantics:** snapshot является append-only domain record: schema не добавляет `updatedAt`, а application layer следующих этапов не должен предоставлять update semantics для snapshot. Произвольный SQL `UPDATE` сейчас не запрещается PostgreSQL trigger или другим database-level механизмом и явно остаётся out of scope; foundation не должен создавать ложное утверждение о технической неизменяемости строки.
- **Issue boundary:** этот change покрывает только `DocumentSnapshot` schema, migration, constraints, indexes и verification. Snapshot creation service, revision allocation/concurrency, current Y.Doc integration, source revision consistency, permissions, metadata API и restore остаются отдельными этапами issue #48.

## Risks / Trade-offs

- [Nullable creator loses direct user attribution for system snapshots] → `NULL` используется только для системного инициатора; будущий application layer должен передавать user id для manual snapshots.
- [Database schema cannot prove revision sequence or capture consistency] → sequence allocation, locking and matching current Y.Doc are explicitly deferred to snapshot creation service.
- [Append-only semantics do not prevent arbitrary SQL UPDATE] → application contracts must omit update operations; database-level enforcement is deferred and not implied by this foundation.
- [Cascade page deletion removes history] → this matches current page/document lifecycle; retention and cross-page history policy are deferred.

## Migration Plan

1. Update Prisma schema and generate a named migration through the API Prisma CLI.
2. Inspect migration SQL and run Prisma validation/generation.
3. Deploy migration before any future snapshot creation code.
4. Rollback by reverting the migration and schema change before snapshot rows are introduced; no application API depends on this foundation yet.
