## Why

В Lite Notion пока нет backend-инфраструктуры для приватных файлов и безопасного связывания изображений с persisted Y.Doc. Issue #47 добавит эту основу для #49, сохранив Y.Doc единственным источником live-контента, а object storage — закрытым.

## What Changes

- Добавить Assets module с провайдер-независимой S3-границей; production использует Selectel Object Storage через стандартный S3 API и AWS SDK for JavaScript v3.
- Принимать изображения потоково через NestJS API, проверять лимит 10 MiB, JPEG/PNG/WebP signature и checksum до сохранения объекта; оставить signed URLs только для чтения.
- Добавить минимальную page-scoped attachment eligibility для защиты Y.Doc references от произвольных `assetId`, используя действующие page permissions.
- Расширить фактическую Prisma schema по v2 для assets, page references/projection, page covers, минимального avatar profile и attachment grants. Pending upload заранее получает committed unique storage key для безопасной reconciliation; не добавлять publication tables.
- Переиспользовать Document Projection из #97 и `PAGE_DOCUMENTS.storage_revision` для post-persistence revision-safe `PAGE_ASSETS` projection и rebuild. CAS и merge актуального persisted Yjs update защищают от позднего stale capture; ограниченный Nest scheduler retry восстанавливает временно stale projection. Не отклонять уже live-synced Hocuspocus Y.Doc из-за asset eligibility error: такие refs fail closed на projection/read boundary.
- Удалять assets только после проверки live/snapshot retention и синхронизации на уровне затронутых pages; ambiguous DB state откладывает S3 delete. Ready assets остаются до explicit uploader delete в MVP, пока #49 не добавит полноценный asset library/list flow; добавить cleanup зависших uploads и orphaned objects.
- Использовать in-memory adapter для unit tests и временный filesystem adapter для PostgreSQL integration tests. Обязательный CI не зависит от S3; отдельный ручной Selectel smoke test выполняется перед production deployment.
- Не включать frontend #49, search #51, publication pipeline #52 или public rendering #53 в этот change.

## Capabilities

### New Capabilities

- `asset-management`: private object storage, streaming upload lifecycle, metadata/read/delete API и authorization.
- `asset-retention`: page-scoped attachment eligibility, live references, revision-safe projection и безопасный GC.

### Modified Capabilities

- `document-projection`: versioned asset image references из persisted Y.Doc через существующую projection boundary.

## Impact

- Backend: NestJS Assets module/use-cases, S3 adapter, bounded stream/temp-file handling, persistence/projection integration, DTO/OpenAPI и cleanup.
- Database: additive schema/migration для `Asset`, `PageAssetGrant`, `PageAsset`, `PageAssetProjection`, `Page.coverAssetId` и минимального `UserProfile`.
- Production storage: первоначально Selectel Object Storage, приватный bucket, endpoint/region/bucket/credentials/path-style через env; без Selectel-specific SDK и pool-specific логики. Storage keys не меняются при documented maintenance-window provider migration.
- Tests/CI: PostgreSQL integration tests с per-suite temporary filesystem storage; Selectel smoke test — отдельный ручной/deployment workflow без обязательных CI credentials.
- Dependencies: `@aws-sdk/client-s3` и `@aws-sdk/s3-request-presigner` для standard S3 API и signed read URLs; stream upload использует ограниченный temp-file pipeline, allowlist/checksum — Node.js APIs.
- Reuse: snapshot infrastructure из PR #93, Document Projection из PR #97 и существующий effective page permission flow.
- Один OpenSpec change и один PR на #47. Связанные задачи: #49, #51, #52, #53.
