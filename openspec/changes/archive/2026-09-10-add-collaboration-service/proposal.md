## Зачем

Редактор уже использует `Y.Doc` как authoritative mutable state, но realtime-синхронизация пока не имеет отдельного backend runtime. Нужен самостоятельный collaboration service, который принимает WebSocket/Yjs подключения, проверяет тот же access JWT, что и API, проверяет доступ к странице и сохраняет бинарное состояние документа без превращения TipTap JSON в источник истины.

## Что меняется

- Добавляется новый deployable application `apps/collaboration`: Node.js/TypeScript WebSocket-сервис на Hocuspocus для realtime-синхронизации Yjs-документов.
- Collaboration service запускается отдельно от NestJS API и не встраивает Hocuspocus внутрь `apps/api`.
- PostgreSQL остаётся общей БД для API и collaboration; отдельная БД, Redis, message broker и service-to-service API calls на каждую WebSocket operation не вводятся.
- Document room names имеют единый формат `page:<pageId>`; неизвестные форматы, не-UUID page id, удалённые страницы и страницы без доступа отклоняются.
- Collaboration service проверяет Origin WebSocket-запроса: browser connections принимаются только с exact `COLLABORATION_ALLOWED_ORIGIN`.
- Collaboration service проверяет access JWT, который выдаёт API, извлекает пользователя и выполняет page authorization через PostgreSQL в `onAuthenticate`.
- Persistence использует `PageDocument.yjsState` как бинарный Yjs state: load из PostgreSQL в Hocuspocus `Y.Doc`, store из Hocuspocus `Y.Doc` обратно в PostgreSQL.
- При store повторно проверяются только persistence invariants: страница и документ существуют, `Page.deletedAt = null`. User authorization не переиспользуется из connection context.
- При store `storageRevision` увеличивается атомарно вместе с записью нового state; `tiptapSchemaVersion` не меняется только из-за очередного Yjs update.
- Пустой `yjsState` (`byteLength === 0`) инициализирует пустой `Y.Doc`, а не применяется как Yjs update.
- Root/dev tooling получает отдельный запуск collaboration service и включает его в обычный `pnpm dev`, если текущий `./apps/*` filter подхватывает приложение автоматически.
- README, env examples, CI и проверки обновляются под новый deployable unit.

Явно вне scope:

- Подключение `@hocuspocus/provider` в `apps/web`, lifecycle connect/reconnect/disconnect и отключение REST autosave.
- Обычный editor traffic из frontend в collaboration runtime: до будущей frontend migration текущий web продолжает использовать REST write-path.
- Awareness/presence UI, cursors, avatars, comments, history/snapshots, publication/search changes.
- Redis, horizontal scaling, offline IndexedDB persistence, отдельная database per service, Kafka/RabbitMQ/NATS или другой broker.
- Kubernetes, service mesh, полноценный permissions refactor или unrelated frontend/API refactoring.
- Удаление текущего REST write-path документа в этом change: текущий frontend ещё не переводится на Hocuspocus.

## Capabilities

### Новые capabilities

- `collaboration-runtime`: standalone Hocuspocus/WebSocket runtime для authenticated Yjs document rooms, Origin validation, page access checks, persistence и shutdown/logging behavior.

### Изменяемые capabilities

- `development-runtime`: локальный dev запуск должен уметь поднимать collaboration service вместе с web/API и отдельно.
- `page-documents`: contract документа фиксирует transition к collaboration-owned writes и недопустимость постоянного dual-writer состояния после будущего web provider change.

## Влияние

- Новый workspace application `apps/collaboration` со своим package, TypeScript config, env validation, tests и build output.
- Узкий `packages/database` для Prisma schema, migrations, generated client, Prisma client factory и DB-contract constants; Nest-specific `PrismaService` остаётся в API.
- Узкий `packages/auth-token` для access-token payload contract и JWT verification; Nest guards, refresh/session logic, cookies и `AuthModule` не переносятся.
- Root scripts, Docker/dev documentation и CI получают collaboration-specific build/typecheck/test шаги там, где текущие workspace filters не покрывают новый app автоматически.
- Hocuspocus/Yjs/JWT dependencies будут добавлены только при реализации approved change; planning stage dependencies не меняет.
