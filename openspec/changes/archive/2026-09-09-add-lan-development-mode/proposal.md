## Why

Сейчас локальный dev-запуск привязан к `localhost`, поэтому приложение неудобно проверять с телефона, планшета или другого компьютера в той же сети. Нужен отдельный LAN-режим, который запускает существующее development окружение на сетевом интерфейсе машины разработчика, не меняя обычный `pnpm dev`.

## What Changes

- Добавляется root-команда `pnpm dev:lan`.
- Команда автоматически определяет private LAN IPv4 через `os.networkInterfaces()` и поддерживает override `LAN_HOST=<IP> pnpm dev:lan`.
- Автоматический LAN IP выбирается только среди non-internal IPv4 из private ranges `10.0.0.0/8`, `172.16.0.0/12` и `192.168.0.0/16`; loopback, IPv6 и internal interfaces игнорируются.
- `LAN_HOST` override принимает валидный client-usable unicast IPv4, чтобы можно было использовать обычную LAN, VPN, Tailscale или нестандартную локальную сеть.
- Если подходящий IP не найден или override невалиден, запуск завершается понятной ошибкой с подсказкой использовать `LAN_HOST`.
- LAN-режим поднимает существующие dev dependencies, включая PostgreSQL, и запускает web и API доступными из локальной сети.
- Web в LAN-режиме слушает `0.0.0.0:3000`, получает `NEXT_PUBLIC_API_BASE_URL=http://${LAN_HOST}:3001`, отключает browser API mocking через `NEXT_PUBLIC_API_MOCKING=disabled` только в environment дочернего процесса и разрешает Next.js dev resources/HMR для выбранного LAN host через `allowedDevOrigins`.
- API в LAN-режиме запускается существующим dev script и получает `CORS_ORIGIN=http://${LAN_HOST}:3000` только через environment дочернего процесса.
- Команда выводит адреса `Web: http://<LAN_IP>:3000` и `API: http://<LAN_IP>:3001`.
- README получает короткую инструкцию по `pnpm dev:lan`, fallback `LAN_HOST=<IP> pnpm dev:lan`, same-network requirement и возможный firewall prompt.

Явно вне scope:

- Изменение поведения `pnpm dev`, `pnpm dev:web` или `pnpm dev:api`.
- Wildcard CORS, ослабление production policy или изменение auth cookie configuration.
- Запись LAN IP в `.env`, `.env.example`, `.env.local` или другие persistable environment files.
- Добавление dependency ради определения IP.
- Реализация Hocuspocus/WebSocket инфраструктуры: в текущей ветке Hocuspocus ещё не подключён, поэтому LAN mode не должен добавлять лишний realtime-сервер.
- Изменение API bootstrap/config без доказанной необходимости.
- Unrelated refactoring package scripts или frontend runtime.

## Capabilities

### New Capabilities

- `development-runtime`: локальные workspace-команды разработки, включая обычный localhost mode и новый LAN mode.

### Modified Capabilities

Нет.

## Impact

- Root package scripts и небольшой Node.js runner/helper under repository tooling.
- `apps/web/package.json` и `apps/web/next.config.ts`: отдельный LAN dev script для Next.js hostname `0.0.0.0` и LAN-only allowlist для Next.js dev resources/HMR.
- API process environment в LAN runner: `CORS_ORIGIN` переопределяется на точный LAN web origin, существующий bootstrap не меняется.
- Unit tests для LAN IP helper.
- README development section and command table.
- Dependencies не добавляются, pnpm catalog и lockfile не меняются.
