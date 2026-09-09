## 1. Основа workspace и приложения

- [x] 1.1 Добавить `apps/collaboration` как private workspace package с Node.js 22, TypeScript, scripts для build/typecheck/test/dev и без frontend dependencies.
- [x] 1.2 Добавить `apps/collaboration/AGENTS.md` с правилами для Hocuspocus hooks, auth, persistence, logging и tests.
- [x] 1.3 Добавить TypeScript/Vitest configuration для collaboration по текущим strict настройкам репозитория.

## 2. Shared database access

- [x] 2.1 Создать узкий `packages/database` и перенести ownership Prisma schema/migrations/generated client из `apps/api` в этот пакет.
- [x] 2.2 Сохранить Nest-specific `PrismaService` внутри API; обновить его на shared generated client/factory/types без изменения REST contracts.
- [x] 2.3 Экспортировать только необходимые database primitives: Prisma client factory, generated Prisma types/client и persisted document constants вроде `DOCUMENT_MAX_BYTES` и `TIPTAP_SCHEMA_VERSION`.
- [x] 2.4 Проверить, что Prisma generate/migrate commands работают, а API tests продолжают использовать ту же schema.

## 3. Shared access-token verification

- [x] 3.1 Создать узкий `packages/auth-token` для `AccessTokenPayload`, результата verification и `verifyAccessToken(token, secret)`.
- [x] 3.2 Не переносить в `packages/auth-token` Nest guards, Passport strategies, refresh/session rotation, cookies, `AuthModule` или database access.
- [x] 3.3 Использовать пакет в collaboration authentication и переиспользовать payload contract в API там, где это совместимо с текущим Passport/Nest flow.
- [x] 3.4 Добавить unit tests для valid, missing, malformed, expired и incorrectly signed access JWT.

## 4. Collaboration configuration и runtime

- [x] 4.1 Добавить `apps/collaboration/.env.example` с `NODE_ENV`, `PORT=3002`, `COLLABORATION_ALLOWED_ORIGIN`, database settings, `JWT_SECRET` и bounded WebSocket payload settings.
- [x] 4.2 Реализовать runtime env validation с безопасными ошибками для missing/invalid settings без утечки secrets/database credentials.
- [x] 4.3 Добавить startup entrypoint, который создаёт Hocuspocus server из validated config и слушает configured port.

## 5. Authentication, Origin и authorization

- [x] 5.1 Реализовать exact Origin validation: browser WebSocket connections принимаются только с `COLLABORATION_ALLOWED_ORIGIN`.
- [x] 5.2 Реализовать collaboration authentication в `onAuthenticate` через access token из Hocuspocus token/request headers без логирования token contents.
- [x] 5.3 Реализовать strict `page:<uuid>` document-name parser с tests для accepted и rejected formats.
- [x] 5.4 Реализовать page access checker для текущей owner-only model: live page, matching owner, existing document row, uniform rejection для missing/foreign/deleted pages.
- [x] 5.5 Сохранить capability-based return shape, чтобы future viewer/editor permissions могли мапиться в read-only/write access.

## 6. Hocuspocus synchronization и persistence

- [x] 6.1 Настроить Hocuspocus через public v4 hooks и typed context для authenticated user/page/capability metadata.
- [x] 6.2 Реализовать `onLoadDocument`: load binary `PageDocument.yjsState`; при `byteLength === 0` инициализировать пустой `Y.Doc` без `Y.applyUpdate`.
- [x] 6.3 Реализовать `onStoreDocument`: encode binary Yjs state и сохранить его через transactional/conditional write, который атомарно проверяет `Page.deletedAt = null`, обновляет `yjsState`, инкрементирует `storageRevision` и оставляет `tiptapSchemaVersion` unchanged.
- [x] 6.4 Убедиться, что `onStoreDocument` не авторизует пользователя через connection context/`lastContext`; store проверяет только persistence invariants через conditional write: page exists, document exists, `deletedAt = null`.
- [x] 6.5 Настроить payload/resource limits aligned with current document size contract.

## 7. Lifecycle, logging и security

- [x] 7.1 Реализовать graceful shutdown для `SIGINT`/`SIGTERM`: stop accepting connections, destroy Hocuspocus server, flush pending stores when supported and disconnect Prisma.
- [x] 7.2 Добавить minimal structured logs для start/stop, failed Origin validation, failed authentication, failed page access, document load/store errors и unexpected WebSocket errors.
- [x] 7.3 Добавить tests или static checks, что logs не включают access tokens, refresh tokens, full Yjs binary state или database credentials.

## 8. Tests

- [x] 8.1 Добавить auth/access tests: no token, invalid token, malformed room, foreign page и deleted page rejected.
- [x] 8.2 Добавить Origin tests: exact `COLLABORATION_ALLOWED_ORIGIN` accepted; missing или mismatched Origin rejected.
- [x] 8.3 Добавить realtime integration tests with two Yjs/Hocuspocus clients: оба подключаются к одной page room, A синхронизируется в B, B синхронизируется в A, concurrent updates сходятся.
- [x] 8.4 Добавить persistence tests: changed `Y.Doc` stored, service/document reload returns same content, empty documents are not corrupted.
- [x] 8.5 Добавить revision tests: `storageRevision` increments with successful stores and `tiptapSchemaVersion` stays unchanged.
- [x] 8.6 Добавить tests, что store для deleted page/document absence получает `0` rows в conditional write и не сохраняет новый state после soft delete.
- [x] 8.7 Держать tests детерминированными без зависимости от external network services, кроме local test server/database setup.

## 9. Developer Experience, CI и docs

- [x] 9.1 Проверить, что root `pnpm dev` подхватывает `apps/collaboration` автоматически через текущий `--filter "./apps/*"`; не менять root script без необходимости.
- [x] 9.2 Добавить root `dev:collaboration`: команда должна запускать PostgreSQL или проверять, что он уже готов, запускать только collaboration service и не запускать web/API; collaboration-specific typecheck/test/build scripts добавить при необходимости и включить app в recursive workspace checks.
- [x] 9.3 Обновить `pnpm dev:lan` plan/runner только если нужно, чтобы future web provider мог достучаться до collaboration по LAN; provider wiring в этом change не добавлять.
- [x] 9.4 Добавить CI job или steps для collaboration install, typecheck, test и build с required env.
- [x] 9.5 Обновить README: local collaboration runtime setup, ports, env и явная пометка, что web в этом change не migrated to Hocuspocus.

## 10. Validation

- [x] 10.1 Запустить `openspec validate add-collaboration-service --strict`.
- [x] 10.2 Запустить required checks для implemented scope: install/dedupe, если manifests менялись, lint, typecheck, tests и build.
- [x] 10.3 Вручную проверить local startup shape: PostgreSQL, web `:3000`, API `:3001`, collaboration `:3002`; REST editor behavior remains unchanged и ordinary editor traffic не попадает в collaboration до future provider migration.
