# development-runtime Specification

## Purpose

Определяет локальные команды запуска development окружения, чтобы разработчик мог проверять приложение как на localhost, так и с других устройств в той же private LAN или через явно выбранный VPN/Tailscale/local IPv4 interface без ручной правки environment files.

## Requirements

### Requirement: Обычный development запуск остаётся localhost-совместимым
Workspace MUST сохранять localhost-совместимое поведение `pnpm dev`: команда поднимает локальные development dependencies и запускает web, API и collaboration runtime с локальной development-конфигурацией без требования LAN IP.

Если текущий root script уже запускает workspace apps через `--filter "./apps/*"`, добавление `apps/collaboration` с собственным `dev` script MUST использовать этот механизм и MUST NOT менять root `pnpm dev` без необходимости.

#### Scenario: Обычный запуск не требует LAN configuration
- **WHEN** разработчик запускает `pnpm dev`
- **THEN** workspace запускает существующее development окружение без необходимости задавать `LAN_HOST`
- **AND** web продолжает использовать localhost API configuration из обычного frontend environment
- **AND** collaboration runtime запускается на локальном development port

### Requirement: LAN development запуск публикует web и API в private network
Workspace MUST предоставлять команду `pnpm dev:lan`, которая поднимает существующие development dependencies, запускает web на `0.0.0.0:3000`, разрешает Next.js development resources/HMR для выбранного LAN host, запускает API через существующий development script на `3001`, настраивает frontend API base URL как `http://<LAN_IP>:3001`, отключает frontend API mocking для LAN web process, настраивает API CORS origin как `http://<LAN_IP>:3000` и печатает адреса `Web: http://<LAN_IP>:3000` и `API: http://<LAN_IP>:3001`.

Команда MUST NOT записывать выбранный IP в `.env`, `.env.example`, `.env.local` или другие persistable environment files.

#### Scenario: Успешный LAN запуск
- **WHEN** разработчик запускает `pnpm dev:lan` на машине с private LAN IPv4
- **THEN** PostgreSQL, web и API запускаются как development окружение
- **AND** другое устройство в той же сети может открыть web по напечатанному `Web` URL
- **AND** Next.js development resources and HMR are not blocked for the printed LAN web host
- **AND** frontend отправляет API-запросы на напечатанный LAN API origin, а не на `localhost`
- **AND** browser API mocking is disabled for that LAN web process

#### Scenario: LAN запуск не меняет environment files
- **WHEN** `pnpm dev:lan` выбирает LAN IP
- **THEN** выбранный IP применяется только к процессам текущего запуска
- **AND** repository environment templates and local env files remain unchanged by the command

#### Scenario: Обычные browser mocks не меняются
- **WHEN** разработчик запускает web вне `pnpm dev:lan`
- **THEN** browser API mocking continues to follow the existing frontend environment configuration
- **AND** the LAN-specific mocking override is not persisted

### Requirement: LAN runner manages two child processes
`pnpm dev:lan` MUST run API and web as long-running child processes after development dependencies are ready. The runner MUST forward `SIGINT` and `SIGTERM` to both child processes, stop the remaining process if the other exits unexpectedly and exit with a non-zero status when a child process exits with an error.

The runner MUST avoid orphan API or web processes, but it MUST NOT introduce a general-purpose process supervisor beyond the two LAN development processes.

#### Scenario: Developer stops LAN mode
- **WHEN** a running `pnpm dev:lan` process receives `SIGINT` or `SIGTERM`
- **THEN** the signal is forwarded to both API and web child processes
- **AND** the runner exits after both child processes stop

#### Scenario: One LAN child process fails
- **WHEN** API or web exits unexpectedly with a non-zero status
- **THEN** the runner stops the other child process
- **AND** the runner exits with a non-zero status

### Requirement: LAN host selection is deterministic and overridable
`pnpm dev:lan` MUST use `LAN_HOST` when it is provided. Without `LAN_HOST`, it MUST choose the first non-internal IPv4 address from private ranges `10.0.0.0/8`, `172.16.0.0/12` or `192.168.0.0/16`. The automatic selection MUST ignore loopback addresses, IPv6 addresses and interfaces marked internal.

`LAN_HOST` override MUST accept a valid client-usable unicast IPv4 address. It MUST reject at least `0.0.0.0`, `127.0.0.0/8`, `224.0.0.0/4`, `240.0.0.0/4` and `255.255.255.255`. If no suitable address is available, or `LAN_HOST` is not a valid client-usable unicast IPv4 address, the command MUST fail before starting web or API and print a clear message that explains how to retry with `LAN_HOST=<IP> pnpm dev:lan`.

#### Scenario: Explicit LAN_HOST wins
- **WHEN** разработчик запускает `LAN_HOST=100.64.0.10 pnpm dev:lan`
- **THEN** workspace uses `100.64.0.10` for printed URLs, frontend API base URL and API CORS origin

#### Scenario: RFC1918 LAN_HOST is accepted
- **WHEN** разработчик запускает `LAN_HOST=192.168.1.42 pnpm dev:lan`, `LAN_HOST=10.0.0.25 pnpm dev:lan` or `LAN_HOST=172.20.10.2 pnpm dev:lan`
- **THEN** workspace uses the provided address for printed URLs, frontend API base URL and API CORS origin

#### Scenario: Invalid LAN_HOST fails clearly
- **WHEN** разработчик запускает `LAN_HOST=0.0.0.0 pnpm dev:lan`, `LAN_HOST=127.0.0.1 pnpm dev:lan`, `LAN_HOST=224.0.0.1 pnpm dev:lan`, `LAN_HOST=255.255.255.255 pnpm dev:lan` or another non-client-usable IPv4 override
- **THEN** `pnpm dev:lan` exits with a non-zero status before starting web or API
- **AND** the error tells the developer to retry with `LAN_HOST=<IP> pnpm dev:lan`

#### Scenario: Loopback, IPv6 and internal interfaces are ignored
- **WHEN** available network interfaces include loopback, IPv6 or internal addresses plus one private non-internal IPv4
- **THEN** LAN mode selects the private non-internal IPv4 address

#### Scenario: Missing LAN IP fails clearly
- **WHEN** no private non-internal IPv4 address is available and `LAN_HOST` is not provided
- **THEN** `pnpm dev:lan` exits with a non-zero status before starting web or API
- **AND** the error tells the developer to retry with `LAN_HOST=<IP> pnpm dev:lan`

### Requirement: Collaboration service can be started independently in development
Workspace MUST предоставить development command для запуска только collaboration service после готовности required local development dependencies. Команда MUST запускать PostgreSQL или проверять, что PostgreSQL уже готов, и MUST NOT запускать web или API processes. Эта команда MUST NOT менять behavior существующих `dev:web` или `dev:api`.

#### Scenario: Developer starts only collaboration runtime
- **WHEN** разработчик запускает collaboration-only development command
- **THEN** PostgreSQL запущен или подтверждён ready
- **AND** collaboration runtime запускается без запуска web или API processes

#### Scenario: Existing scoped dev commands remain unchanged
- **WHEN** разработчик запускает `pnpm dev:web` или `pnpm dev:api`
- **THEN** эти команды сохраняют своё existing scoped behavior
