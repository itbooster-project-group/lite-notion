## Контекст

Мотивация и target behavior описаны в `proposal.md` и delta specs.

Текущее состояние, которое формирует архитектуру:

- Workspace содержит `apps/web` и `apps/api`; `pnpm-workspace.yaml` включает `apps/*`, поэтому `apps/collaboration` автоматически станет workspace package.
- Root `pnpm dev` уже запускает `pnpm --parallel --filter "./apps/*" run dev` после `pnpm db:up`; значит новый app будет подхвачен автоматически, если у него появится `dev` script.
- `apps/api` владеет Prisma schema, migrations и generated client в `apps/api/src/generated/prisma`; PostgreSQL поднимается через `apps/api/docker-compose.yaml`.
- `PageDocument` хранит `pageId`, `tiptapSchemaVersion`, `yjsState`, `storageRevision`, `createdAt`, `updatedAt`; свежая страница получает пустой `yjsState` и `storageRevision = 0`.
- REST `PUT /api/v1/pages/{pageId}/document` сейчас полностью заменяет `yjsState`, инкрементирует `storageRevision` и принимает `tiptapSchemaVersion` от клиента.
- Access JWT содержит `sub` и `sid`, подписывается `JWT_SECRET` и проверяется без обращения к базе; refresh/session rotation остаётся бизнес-логикой API.
- Page access сейчас owner-only: чтения и записи фильтруют `Page.deletedAt = null` и `ownerId = currentUser.id`; чужая, удалённая и отсутствующая страница не различаются.
- Web editor core уже transport-neutral: `PageEditorSurface` получает ready `Y.Doc` через `PageDocumentSession`, а workspace UI пока не монтирует реальный editor.
- Hocuspocus v4 official docs требуют Node.js 22+, используют public hooks `onAuthenticate`, `onLoadDocument`, `onStoreDocument`, `onListen`, `onDestroy`, web-standard `Request`/`Headers`, built-in `Server.listen()` и `server.destroy()` для shutdown.

## Цели и не-цели

**Цели:**

- Создать отдельный `apps/collaboration` runtime и local/dev/CI контур для него.
- Авторизовать WebSocket document rooms тем же access JWT contract, что и API.
- Проверять browser WebSocket Origin exact-match через `COLLABORATION_ALLOWED_ORIGIN`.
- Проверять page access напрямую через PostgreSQL без API HTTP request на каждую WS operation.
- Persist-ить binary Yjs state в существующий `PageDocument.yjsState`, атомарно инкрементируя `storageRevision`.
- Оставить web provider migration отдельному change и явно не создать постоянный dual-writer final state.

**Не-цели:**

- Не подключать `@hocuspocus/provider` в `apps/web`, не менять `PageDocumentSession` composition и не отключать REST autosave в этом change.
- Не направлять обычный editor traffic в collaboration runtime до будущей frontend migration.
- Не добавлять Redis, message broker, awareness UI, IndexedDB/offline, horizontal scaling или отдельную БД.
- Не выносить весь API `AuthModule`/`PagesModule` в shared packages и не делать permissions refactor.
- Не менять production routes/API contract без отдельного OpenSpec.

## Решения

### 1. Hocuspocus как отдельный `apps/collaboration`, а не часть NestJS API

`apps/collaboration` будет самостоятельным Node.js/TypeScript application и deployable unit. Он запускает Hocuspocus built-in `Server`, слушает собственный `PORT` и закрывается через `server.destroy()` при shutdown.

Причина: realtime runtime имеет другой lifecycle, connection model, load/store debounce и future scaling requirements, чем REST API. Встраивание Hocuspocus в NestJS API смешало бы HTTP request lifecycle, API guards/controllers и long-lived WebSocket document state, а также усложнило бы будущий horizontal scaling.

Альтернатива — mount Hocuspocus внутри NestJS или Express API. Она отвергнута: текущий API держит routes closed-by-default через Nest guards и HTTP-specific filters, а Hocuspocus hooks должны оставаться отдельным realtime boundary.

### 2. Одна PostgreSQL пока остаётся общей БД

API и collaboration используют одну PostgreSQL database и одни таблицы `Page`/`PageDocument`. Отдельная database не вводится.

Причина: authorization и persistence должны видеть один transactionally consistent document/page state. Разнос на две БД потребовал бы replication/outbox и решил бы проблему, которой пока нет.

Redis, Kafka/RabbitMQ/NATS и другие брокеры не нужны для single-instance collaboration. Future scaling point: когда появятся 2+ экземпляра collaboration service, отдельный OpenSpec добавит Redis extension/pubsub для Hocuspocus coordination и пересмотрит deployment topology.

### 3. Shared Prisma/database access

Выбор: создать узкий workspace package `packages/database`.

Он должен владеть:

- `prisma/schema.prisma` и migrations, перенесёнными из `apps/api/prisma`;
- Prisma generated client output внутри package;
- маленьким factory для Prisma Client с `@prisma/adapter-pg`, `DATABASE_URL` и `DATABASE_CONNECTION_TIMEOUT_MS`;
- shared constants/types, которые относятся к persisted database contract: `DOCUMENT_MAX_BYTES`, `TIPTAP_SCHEMA_VERSION`, bytes type при необходимости.

Сравнение вариантов:

- Оставить Prisma внутри API и дать collaboration собственную generated copy. Это минимально в моменте, но создаёт две Prisma schemas/migrations или зависимость collaboration от `apps/api` internals; оба варианта плохо подходят двум deployable units.
- Вынести schema/client в `packages/database`. Это конкретный shared concern, уже нужен двум приложениям, соответствует правилу репозитория и не создаёт абстрактный `common`.
- Дать collaboration импортировать `apps/api/src/generated/prisma`. Это отвергнуто: зависимость нового deployable от API source/generated output сделает API владельцем чужого runtime contract и усложнит CI/build.

`packages/database` не переносит Nest-specific `PrismaService`. API сохраняет свой Nest provider/service layer и только переключает его на shared generated client/factory/types. Collaboration использует тот же package напрямую. Большого refactor repositories/use-cases не требуется.

### 4. Shared JWT verification через `packages/auth-token`

Выбор: создать узкий workspace package `packages/auth-token`.

Пакет экспортирует только:

- `AccessTokenPayload` contract для API-issued access JWT (`sub`, `sid` и стандартные JWT claims при необходимости);
- результат verification с `userId` и `sessionId`;
- `verifyAccessToken(token, secret)` с проверкой подписи, expiration и формы payload.

Пакет не содержит Nest guards, Passport strategies, refresh-token/session rotation, cookies, `AuthModule` или database access. API может переиспользовать тип payload и verification primitive там, где это не ломает текущий Passport/Nest flow; collaboration использует `verifyAccessToken` напрямую в `onAuthenticate`.

Flow:

`client -> access token -> Hocuspocus onAuthenticate -> verify JWT -> extract user -> parse pageId -> check page access -> allow/reject`.

Collaboration не делает HTTP request в API на каждое подключение: текущий access token уже является short-lived self-contained credential, а API `JwtStrategy` также не ходит в БД при verification. Это снижает latency и не вводит API availability как dependency для каждого WS connect.

### 5. Origin validation

Browser WebSocket connections принимаются только с exact `COLLABORATION_ALLOWED_ORIGIN`, например `http://localhost:3000` в обычном local dev. Проверка выполняется до доступа к документу и до load/store. Отсутствующий или несовпадающий `Origin` для публичного WebSocket endpoint отклоняется безопасной ошибкой.

Причина: JWT проверяет пользователя, но Origin ограничивает браузерные подключения ожидаемым frontend origin и не должен заменяться wildcard CORS. Значение настраивается env и не хардкодит production URL.

### 6. Room format `page:<pageId>`

Единственный accepted document name format: `page:<uuid>`.

Причина: room name одновременно transport address и key для persistence/authorization. Prefix делает формат расширяемым для будущих типов документов, а strict UUID parsing не даёт клиенту использовать произвольные storage names.

Неизвестные prefixes, malformed UUID и дополнительные path/query-like части отклоняются до document load. Сервер не доверяет document name: после parsing page id всё равно проверяется в PostgreSQL.

### 7. Page authorization boundary

Collaboration вводит маленький access checker:

- input: authenticated user id, page id;
- query: live page by `id`, `ownerId`, `deletedAt: null`, with document existence;
- output: internal capability, initially `{ canRead: true, canWrite: true }` for owner.

Чужая, удалённая, отсутствующая page и missing document row отклоняются одинаково. Это повторяет существующую isolation policy API и оставляет точку расширения под future viewer/editor permissions без внедрения полноценной permissions model сейчас.

### 8. Load/store Y.Doc

Hocuspocus persistence hooks работают с Yjs binary state:

- `onAuthenticate` выполняет Origin check, JWT verification, document-name parsing и page authorization; authenticated/access context используется для admission decision.
- `onLoadDocument` получает `documentName`, использует уже проверенный page id/access context и загружает stored `PageDocument.yjsState`.
- Если `PageDocument.yjsState.byteLength === 0`, loader создаёт пустой `Y.Doc` и не вызывает `Y.applyUpdate` для пустого массива.
- Если `yjsState` непустой, loader применяет state через public Yjs API и инициализирует room этим документом.
- `onStoreDocument` получает current Yjs document and encodes binary state with public Yjs API.
- `onStoreDocument` не выполняет user authorization через connection context, `lastContext` или последнего подключенного клиента. Store может выполняться после disconnect, поэтому он повторно проверяет только persistence invariants: `Page` существует, `Page.deletedAt = null`, `PageDocument` существует.
- Store не делает отдельный check `Page.deletedAt = null` с последующим unconditional update. Сохранение выполняется одним transactional/conditional write, например conditional `PageDocument.updateMany` с predicate по `pageId` и связанной `Page.deletedAt = null`.
- Conditional write атомарно меняет `yjsState`, инкрементирует `storageRevision` и обновляет `updatedAt`; `tiptapSchemaVersion` не меняется при обычном collaboration update.
- Если conditional write затронул `0` rows, runtime считает, что page/document отсутствуют или page soft-deleted, не сохраняет state и логирует безопасную store-invariant ошибку без document payload.

TipTap JSON допускается только как derived representation в web/static rendering и не становится persistence source. Collaboration не валидирует TipTap schema content на каждом update; admission validation остаётся за editor/session boundary, а binary Yjs state остаётся opaque.

### 9. Ownership записи и transition

Target после полного подключения:

`apps/collaboration = единственный permanent writer PageDocument.yjsState`.

Этот change ещё не подключает web к Hocuspocus, поэтому обычный editor traffic не приходит в collaboration runtime, а REST `PUT /document` остаётся, чтобы не сломать текущий frontend. Следующий отдельный OpenSpec `connect-page-editor-collaboration` должен одновременно:

- добавить `@hocuspocus/provider` в web;
- подключить provider к существующему `PageDocumentSession`/`Y.Doc`;
- описать connect/reconnect/disconnect lifecycle;
- отключить frontend REST autosave/write path;
- удалить или запретить REST write-path, конкурирующий с Hocuspocus persistence.

Нельзя завершать будущую миграцию состоянием, где browser одновременно пишет `PUT /document` и через WebSocket/Hocuspocus в одну строку `PageDocument.yjsState`.

### 10. Runtime configuration и lifecycle

`apps/collaboration/.env.example` должен следовать текущему стилю API env:

- `NODE_ENV=development`
- `PORT=3002`
- `COLLABORATION_ALLOWED_ORIGIN=http://localhost:3000`
- `DATABASE_URL=...`
- `DATABASE_CONNECTION_TIMEOUT_MS=5000`
- `JWT_SECRET=local-development-only-change-me-before-deploy`
- `COLLABORATION_WEBSOCKET_MAX_PAYLOAD_BYTES=1048576`
- опционально `COLLABORATION_STORE_DEBOUNCE_MS` и `COLLABORATION_STORE_MAX_DEBOUNCE_MS`, если Hocuspocus defaults нужно закрепить тестируемо.

Validation должна быть строгой: port range, HTTP(S) origin, PostgreSQL URL, positive bounded timeouts/limits, JWT secret min length. Ошибки не печатают secret/database credentials.

Lifecycle:

- server start/stop logs;
- `SIGINT`/`SIGTERM` инициируют shutdown;
- Hocuspocus server destroys/flushed pending stores through public API;
- Prisma disconnect выполняется после server destroy;
- повторный shutdown идемпотентен.

### 11. Logging and security

Логировать: start/stop, failed authentication, failed Origin validation, failed document access, document load/store errors, unexpected WS errors. Не логировать: access/refresh tokens, full Yjs binary state, document content, database credentials.

Use Hocuspocus public configuration for bounded resources: `websocketOptions.maxPayload` aligned with `DOCUMENT_MAX_BYTES`, plus pre-auth queue defaults unless tests reveal a need to lower them. Rate limiting не вводится: это отдельная edge/deployment concern. Risk DoS от большого количества connections/documents остаётся известным ограничением single-instance v1.

## Риски и trade-offs

- Shared Prisma move can touch many API imports: keep `packages/database` narrow and preserve API behavior with existing tests.
- Single collaboration instance has no cross-instance document coordination: document as unsupported for horizontal scaling until Redis change.
- Store debounce can delay persistence: tests must wait deterministically for store completion or expose a test-only flush path through public server lifecycle.
- Access tokens can expire while WS connection stays open: v1 authenticates at connection/document authentication; mid-connection revocation/expiry enforcement can be added later with token sync or message hook if product requires it.
- REST write remains temporarily: acceptable only before web provider migration; design/spec explicitly forbids final dual writer.

## План миграции

1. Introduce `packages/database`, move Prisma schema/migrations, update API Prisma scripts and imports without changing database schema.
2. Add `packages/auth-token` with the access-token payload contract and verification primitive.
3. Add `apps/collaboration` with config, Origin validation, auth, page access, Hocuspocus server, persistence, tests and docs.
4. Update root scripts/CI/dev docs where current workspace filters do not already include collaboration.
5. Keep current web REST behavior unchanged.

Rollback removes `apps/collaboration`, `packages/auth-token`, collaboration scripts/docs/CI changes, and reverts Prisma ownership to API if implementation has not been followed by additional changes.

## Открытые вопросы

Blocking questions нет. Production deployment URLs/secrets and future multi-instance Redis topology are intentionally deferred to deployment/scaling changes.
