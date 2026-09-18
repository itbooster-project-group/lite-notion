# development-runtime Specification

## Purpose

Определяет локальные команды запуска development окружения, чтобы разработчик мог проверять приложение как на localhost, так и с других устройств в той же private LAN или через явно выбранный VPN/Tailscale/local IPv4 interface без ручной правки environment files.
## Requirements

### Requirement: Обычный development запуск остаётся localhost-совместимым
Workspace MUST сохранять localhost-совместимое поведение `pnpm dev`: команда поднимает локальные development dependencies и запускает web, API и collaboration runtime с локальной development-конфигурацией без требования LAN IP.

Локальные development dependencies MUST включать PostgreSQL, брокер для синхронизации реплик collaboration и шлюз. Команда MUST дожидаться готовности каждой из них до запуска зависящих от неё процессов.

Разработчик MUST открывать приложение по единственному адресу — адресу шлюза. Адреса web, API и collaboration runtime по отдельности MUST NOT требоваться для обычной работы.

Если текущий root script уже запускает workspace apps через `--filter "./apps/*"`, добавление процессов MUST использовать этот механизм и MUST NOT менять root `pnpm dev` без необходимости.

#### Scenario: Обычный запуск не требует LAN configuration
- **WHEN** разработчик запускает `pnpm dev`
- **THEN** workspace запускает существующее development окружение без необходимости задавать `LAN_HOST`
- **AND** collaboration runtime запускается на локальном development port

#### Scenario: Приложение открывается по одному адресу
- **WHEN** разработчик открывает адрес шлюза после `pnpm dev`
- **THEN** frontend загружается и его запросы к API и collaboration идут через тот же адрес

#### Scenario: Запуск поднимает брокер
- **WHEN** разработчик запускает `pnpm dev`
- **THEN** брокер запущен или подтверждён готовым до старта collaboration runtime

### Requirement: LAN development запуск публикует web и API в private network
Workspace MUST предоставлять команду `pnpm dev:lan`, которая поднимает существующие development dependencies, публикует шлюз на выбранном LAN host, разрешает Next.js development resources/HMR для этого host, настраивает frontend base URL как адрес шлюза, отключает frontend API mocking для LAN web process и печатает единственный адрес приложения.

Поскольку весь трафик идёт через один origin, отдельные LAN-адреса API и collaboration MUST NOT публиковаться и MUST NOT печататься.

Команда MUST NOT записывать выбранный IP в `.env`, `.env.example`, `.env.local` или другие persistable environment files.

#### Scenario: Успешный LAN запуск
- **WHEN** разработчик запускает `pnpm dev:lan` на машине с private LAN IPv4
- **THEN** development dependencies, web, API и collaboration запускаются как development окружение
- **AND** другое устройство в той же сети может открыть приложение по напечатанному адресу
- **AND** Next.js development resources and HMR are not blocked for the printed LAN host
- **AND** browser API mocking is disabled for that LAN web process

#### Scenario: Печатается один адрес
- **WHEN** `pnpm dev:lan` сообщает адреса запущенного окружения
- **THEN** печатается адрес шлюза
- **AND** отдельные адреса API и collaboration не печатаются

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
Workspace MUST предоставить development command для запуска только collaboration service после готовности required local development dependencies. Команда MUST обеспечивать готовность брокера и доступность API, поскольку collaboration runtime получает и авторизацию, и содержимое документов через API. Команда MUST NOT запускать web process. Эта команда MUST NOT менять behavior существующих `dev:web` или `dev:api`.

Прямой доступ к PostgreSQL MUST NOT требоваться процессу collaboration: собственного подключения к базе у него нет.

#### Scenario: Developer starts only collaboration runtime
- **WHEN** разработчик запускает collaboration-only development command
- **THEN** брокер запущен или подтверждён ready
- **AND** collaboration runtime запускается без запуска web process

#### Scenario: Collaboration не требует переменных доступа к базе
- **WHEN** collaboration runtime запускается в development
- **THEN** его окружение не содержит database URL и database connection timeout

#### Scenario: Existing scoped dev commands remain unchanged
- **WHEN** разработчик запускает `pnpm dev:web` или `pnpm dev:api`
- **THEN** эти команды сохраняют своё existing scoped behavior

### Requirement: Development and LAN environments configure collaboration transport

Development workspace MUST сообщать web адрес collaboration-транспорта, и этот адрес MUST указывать на шлюз, а не на порт collaboration runtime. LAN mode MUST выводить его из выбранного LAN host тем же способом.

Поскольку frontend и collaboration доступны через один origin, `COLLABORATION_ALLOWED_ORIGIN` MUST совпадать с origin шлюза. Generic shared collaboration transport MUST receive the page room name from domain/composition rather than constructing it from page knowledge.

#### Scenario: Ordinary local development
- **WHEN** developer runs `pnpm dev`
- **THEN** web использует адрес collaboration-транспорта, ведущий на шлюз
- **AND** collaboration runtime стартует на своём локальном порту, не публикуемом наружу

#### Scenario: LAN development
- **WHEN** developer runs `pnpm dev:lan` with selected LAN host
- **THEN** web получает адрес collaboration-транспорта на LAN-адресе шлюза
- **AND** collaboration принимает ровно этот origin
- **AND** runner starts and stops collaboration together with API and web

#### Scenario: CSP allows configured collaboration connection
- **WHEN** page editor route is served
- **THEN** its CSP `connect-src` allows the configured gateway origin for both HTTP and WebSocket
- **AND** CSP does not rely on a hardcoded localhost collaboration address

### Requirement: Локальное окружение описывает брокер и шлюз декларативно

Локальное и production окружение MUST описывать брокер и шлюз как сервисы того же compose-описания, что и PostgreSQL. Их запуск MUST выполняться теми же командами управления зависимостями, что и запуск базы.

Compose-описание MUST публиковать наружу только порт шлюза; порты базы и брокера MAY публиковаться локально, потому что в development к ним обращаются процессы на машине разработчика.

Web, API и collaboration runtime в development MUST продолжать запускаться процессами, а не контейнерами: watch-режим и скорость перезапуска важнее изоляции портов на машине разработчика. Их порты при этом остаются занятыми локально, и шлюз MUST обращаться к ним по адресу хоста. Недостижимость этих портов MUST требоваться от production-развёртывания, а не от локального запуска.

Конфигурация шлюза MUST храниться в репозитории и MUST быть одинаковой по структуре для локального и LAN-запуска.

#### Scenario: Зависимости поднимаются одной командой
- **WHEN** разработчик выполняет команду запуска локальных зависимостей
- **THEN** PostgreSQL, брокер и шлюз становятся готовы

#### Scenario: Compose публикует только шлюз
- **WHEN** окружение запущено
- **THEN** среди опубликованных compose-портов есть порт шлюза и нет портов API и collaboration runtime

#### Scenario: Шлюз доходит до процессов на хосте
- **WHEN** разработчик обращается к адресу шлюза, а web, API и collaboration запущены процессами
- **THEN** запрос доходит до нужного процесса
