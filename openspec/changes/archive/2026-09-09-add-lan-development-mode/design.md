## Context

Мотивация — см. `proposal.md` → «Why». Требуемое поведение — см. `specs/development-runtime/spec.md`.

Текущее состояние, которое формирует подход:

- Root `pnpm dev` поднимает PostgreSQL через `pnpm db:up`, затем параллельно запускает `apps/*` script `dev`.
- Web запускается через `next dev`, а generated transport читает `NEXT_PUBLIC_API_BASE_URL` с fallback на `http://localhost:3001`.
- API запускается через `nest start --watch`, валидирует обязательные `NODE_ENV`, `PORT`, `CORS_ORIGIN`, database и auth settings и вызывает `app.listen(config.port)`.
- Проверка текущего Node.js 22 runtime показала, что `server.listen(port)` без host слушает unspecified address (`::`) и принимает IPv4 connection; исходный NestJS `app.listen(config.port)` поэтому не требует дополнительного bind host для LAN IPv4.
- CORS уже настроен exact-match against `CORS_ORIGIN` with `credentials: true`; wildcard origin запрещён существующими тестами и правилами `apps/api/AGENTS.md`.
- Development refresh cookie уже использует `SameSite=Lax; Secure=false`, поэтому origin pair `http://<LAN_IP>:3000` и `http://<LAN_IP>:3001` остаётся same-site по schemeful site; менять auth helpers не нужно.
- Hocuspocus в текущей ветке не подключён: есть Tiptap/Yjs editor foundation, но нет `@hocuspocus/*`, отдельного WebSocket server или public Hocuspocus env.

## Goals / Non-Goals

**Goals:**

- Добавить один LAN runner, который переиспользует существующие workspace dev scripts и не дублирует логику запуска приложений.
- Определять LAN IP без зависимостей и покрыть выбор адреса тестами как чистую функцию.
- Передавать LAN-specific env только дочерним процессам текущего запуска.
- Сохранить обычный `pnpm dev` и production behavior без изменений.

**Non-Goals:**

- Не добавлять Hocuspocus infrastructure до появления соответствующего approved realtime change.
- Не расширять API configuration surface, product routes, auth behavior, database schema или generated OpenAPI client.
- Не делать cross-platform process supervisor шире, чем нужно для development runner.

## Decisions

### 1. Root Node.js runner instead of chained shell script

`pnpm dev:lan` запускает `node scripts/dev-lan.mjs`. Runner сначала вычисляет LAN host, затем синхронно выполняет `pnpm db:up`, после успеха запускает два long-running child processes:

- `pnpm --filter @lite-notion/api dev`
- `pnpm --filter @lite-notion/web dev:lan`

Причина: shell script плохо переносит вычисление LAN host, обработку ошибок и корректный lifecycle двух дочерних процессов. Node.js уже обязателен в репозитории, а `node:os` и `node:child_process` покрывают всё без dependencies.

Альтернатива — добавить dependency вроде `internal-ip` или `concurrently`. Она отвергнута: задача прямо запрещает dependency ради IP, а параллельный запуск двух процессов достаточно мал, чтобы держать его в runner.

Runner реализует минимальный lifecycle:

- `SIGINT` и `SIGTERM` передаются обоим child processes;
- если API или web неожиданно завершился, второй child process останавливается;
- если child process завершился с ошибкой, runner завершает общий запуск с non-zero status;
- после shutdown не остаются orphan API/web processes.

Это не универсальный supervisor: runner знает только о двух LAN dev processes и не вводит restart/backoff/retry policy.

### 2. Pure LAN host helper as `.mjs`

Выбор адреса живёт в `scripts/lan-host.mjs` и экспортирует чистые функции:

- validation IPv4, client-usable unicast IPv4 and RFC1918 private IPv4;
- выбор первого non-internal private IPv4 из структуры, совместимой с `os.networkInterfaces()`;
- разрешение host с приоритетом `LAN_HOST`.

Автоматический выбор намеренно ограничен RFC1918 private ranges, чтобы случайно не опубликовать dev URL на public или нежелательном интерфейсе. Ручной `LAN_HOST` шире: он принимает valid client-usable unicast IPv4, включая обычную LAN, VPN/Tailscale/нестандартные локальные сети, потому что developer явно выбирает адрес. Минимальная override validation отклоняет адреса, непригодные как host в `http://<LAN_HOST>:3000`: `0.0.0.0`, `127.0.0.0/8`, `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255` и синтаксически невалидные IPv4.

Тесты живут рядом как `scripts/lan-host.test.mjs` и запускаются через `node --test`, чтобы не добавлять root test dependency. Root `pnpm test` получает предварительный шаг `pnpm test:dev-lan`, после которого сохраняет существующий recursive Vitest прогон приложений.

### 3. Process env only, no `.env` writes

Runner формирует значения:

- web: `LAN_HOST=${lanHost}`, `NEXT_PUBLIC_API_BASE_URL=http://${lanHost}:3001`, `NEXT_PUBLIC_API_MOCKING=disabled`;
- API: `PORT=3001`, `CORS_ORIGIN=http://${lanHost}:3000`;
- printed URLs: `Web: http://${lanHost}:3000`, `API: http://${lanHost}:3001`.

Эти значения передаются только в `env` дочерних процессов. `.env`, `.env.example` и `.env.local` не читаются и не переписываются runner ради LAN IP.

`NEXT_PUBLIC_API_MOCKING=disabled` нужен только для LAN web child process: LAN mode поднимает реальный API и PostgreSQL, поэтому browser MSW не должен перехватывать API-запросы. Обычный `pnpm dev` и `pnpm dev:web` продолжают следовать существующей frontend env configuration.

Next.js 16 блокирует cross-origin access к development resources, включая `/_next/hmr`, даже когда `next dev` слушает `0.0.0.0`. Поэтому web child получает validated `LAN_HOST`, а `apps/web/next.config.ts` в development добавляет `allowedDevOrigins: [process.env.LAN_HOST]`. Значение передаётся как bare host/IP без protocol и port, например `192.168.0.199`, и существует только в environment текущего `pnpm dev:lan` запуска.

### 4. API bootstrap remains unchanged

Отдельный `API_BIND_HOST` не вводится. Текущий bootstrap уже вызывает `app.listen(config.port)`, а Node.js без host слушает unspecified address и принимает IPv4 connection. LAN runner должен менять для API только `CORS_ORIGIN`, чтобы exact-origin CORS совпал с LAN web origin.

Альтернатива — добавить configurable bind host «на всякий случай». Она отвергнута: это расширяет API configuration surface без наблюдаемой необходимости и нарушает принцип минимального scope.

### 5. Hocuspocus remains future-compatible only

Так как Hocuspocus не подключён, runner не задаёт `NEXT_PUBLIC_HOCUSPOCUS_URL` и не запускает WebSocket server. Будущий realtime change сможет добавить в тот же runner `NEXT_PUBLIC_HOCUSPOCUS_URL=ws://${lanHost}:<port>` и bind своего server на `0.0.0.0`, не меняя LAN host helper.

## Risks / Trade-offs

- Несколько private интерфейсов могут существовать одновременно → выбирается первый адрес в порядке `os.networkInterfaces()`; developer может явно задать `LAN_HOST`.
- Firewall операционной системы может блокировать входящие соединения → README предупреждает о same network и possible firewall prompt.
- Node.js на редкой платформе может слушать IPv6-only unspecified address → manual smoke-check с другого устройства является обязательной validation; если такой runtime встретится, отдельный API bind change потребует нового обоснованного OpenSpec update.

## Migration Plan

Миграций данных нет. Rollback удаляет `dev:lan` scripts, tooling files, tests, README section и OpenSpec change.
