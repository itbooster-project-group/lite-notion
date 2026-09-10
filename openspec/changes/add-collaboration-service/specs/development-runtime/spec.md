## MODIFIED Requirements

### Requirement: Обычный development запуск остаётся localhost-совместимым
Workspace MUST сохранять localhost-совместимое поведение `pnpm dev`: команда поднимает локальные development dependencies и запускает web, API и collaboration runtime с локальной development-конфигурацией без требования LAN IP.

Если текущий root script уже запускает workspace apps через `--filter "./apps/*"`, добавление `apps/collaboration` с собственным `dev` script MUST использовать этот механизм и MUST NOT менять root `pnpm dev` без необходимости.

#### Scenario: Обычный запуск не требует LAN configuration
- **WHEN** разработчик запускает `pnpm dev`
- **THEN** workspace запускает существующее development окружение без необходимости задавать `LAN_HOST`
- **AND** web продолжает использовать localhost API configuration из обычного frontend environment
- **AND** collaboration runtime запускается на локальном development port

## ADDED Requirements

### Requirement: Collaboration service can be started independently in development
Workspace MUST предоставить development command для запуска только collaboration service после готовности required local development dependencies. Команда MUST запускать PostgreSQL или проверять, что PostgreSQL уже готов, и MUST NOT запускать web или API processes. Эта команда MUST NOT менять behavior существующих `dev:web` или `dev:api`.

#### Scenario: Developer starts only collaboration runtime
- **WHEN** разработчик запускает collaboration-only development command
- **THEN** PostgreSQL запущен или подтверждён ready
- **AND** collaboration runtime запускается без запуска web или API processes

#### Scenario: Existing scoped dev commands remain unchanged
- **WHEN** разработчик запускает `pnpm dev:web` или `pnpm dev:api`
- **THEN** эти команды сохраняют своё existing scoped behavior
