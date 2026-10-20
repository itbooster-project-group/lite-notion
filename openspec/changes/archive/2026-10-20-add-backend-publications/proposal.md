## Why

Lite Notion уже хранит неизменяемые snapshots документов, умеет захватывать актуальный Y.Doc из collaboration layer и строить schema-aware projection. Backend пока не может атомарно превратить одно captured состояние в публичную версию с rendering и asset references, поэтому #53 не имеет безопасного read contract.

## What Changes

- Добавить backend pipeline первой публикации и republish: capture, snapshot с `reason = publication`, immutable rendering и snapshot-scoped asset references фиксируются одной транзакцией до переключения publication.
- Добавить publication persistence, authenticated команды управления, metadata/slug update и unauthenticated read API по slug.
- Добавить authenticated management read `GET /pages/:pageId/publication` с DTO состояния, SEO и `publicPath` вида `/p/:slug` для frontend #53.
- Разрешать публичный доступ к asset только через текущую published publication и её snapshot; оставить object storage приватным и интегрировать snapshot references в retention GC.
- Скрывать публикации при soft delete страницы или проекта и не возобновлять их при restore.
- Добавить durable post-commit invalidation для frontend route `/p/:slug` с multi-instance claims и контрактом для frontend #53; до надёжного отзыва публикации frontend не хранит публичный HTML в долгоживущем cache.
- Сериализовать grant/revoke permissions с публикацией тем же owner lock, чтобы отзыв прямого или унаследованного editor права имел однозначный порядок относительно publish.

Не входят UI управления, Next.js public route/SSR, history/restore UI, search, аналитика, password protection, custom domains, guest comments и public collaboration.

## Capabilities

### New Capabilities

- `page-publications`: управление публикацией, atomic snapshot/rendering pipeline, public read и revalidation contract.

### Modified Capabilities

- `asset-retention`: учитывать активный publication snapshot и cover при GC, проверять доступ к публичным assets только в текущем published context.

## Impact

- Backend: NestJS modules/use-cases, repositories/read query, DTO/controllers, permission grant/revoke writes, page/project soft-delete flows, asset GC и in-process scheduler.
- Database: additive Prisma models/migration для `DocumentRendering`, `SnapshotAsset`, `PagePublication` и leased durable revalidation outbox.
- Existing infrastructure: `DocumentCaptureClient`, `CreateSnapshotInternalUseCase`, `projectDocument`, `TransactionRunner`, `TransactionScope`, `ownerLock`, private `ObjectStorage` и существующие retention checks.
- API: authenticated publication management read/write routes; unauthenticated read and redirect asset resolver; optional internal revalidation delivery config/contract for #53. No new queue, Redis, or dependency.
