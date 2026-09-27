## Why

Документ сейчас хранится только как текущее бинарное состояние `Y.Doc` в `PageDocument`, поэтому будущие history, publication и restore не имеют постоянного append-only источника. Этот change — первый persistence-этап issue #48 (`Part of #48`), а не закрытие всей задачи.

## What Changes

- Добавить Prisma enum `SnapshotReason` со значениями `automatic`, `manual`, `publication`, `restore`.
- Добавить append-only domain-модель `DocumentSnapshot` для бинарного Yjs state и его provenance.
- Добавить связи snapshots с `Page` и nullable creator с `User` для system-generated snapshots.
- Добавить unique constraint для revision внутри страницы и индексы истории, source storage revision и nullable creator FK.
- Создать PostgreSQL migration для новой модели.
- Добавить verification для schema, migration и затронутого API package, включая build.
- Не добавлять snapshot service, API, restore, scheduler, publication flow, TipTap rendering или frontend integration.

## Capabilities

### New Capabilities

- `document-snapshot-persistence`: постоянное хранение append-only snapshot records документа и их database constraints.

### Modified Capabilities

<!-- Текущие runtime-требования page-documents не меняются: snapshot rows только ссылаются на persisted storage revision. -->

## Impact

- `apps/api/prisma/schema.prisma` и новая Prisma migration; implementation этих файлов начнётся только после утверждения текущего плана.
- Prisma Client generated types обновятся локально через `prisma generate`, но generated output не коммитится.
- API endpoints, collaboration runtime, frontend и существующий `PageDocument` write path не изменяются.

Следующие этапы issue #48 остаются отдельными changes: snapshot creation service, revision allocation/concurrency, current Y.Doc integration, sourceStorageRevision consistency, permissions, metadata API и restore.
