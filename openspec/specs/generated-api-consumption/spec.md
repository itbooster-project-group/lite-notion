# generated-api-consumption Specification

## Purpose

Определяет единый воспроизводимый OpenAPI-контракт для типизированного frontend-доступа к API и согласованных сетевых mock-сценариев.

## Requirements

### Requirement: Воспроизводимый OpenAPI snapshot
Репозиторий MUST уметь создать детерминированный OpenAPI JSON snapshot из Nest application metadata без запущенного HTTP-сервера и доступной базы данных. Snapshot MUST коммититься и MUST соответствовать публикуемому development OpenAPI document.

#### Scenario: Генерация snapshot без внешних сервисов
- **WHEN** разработчик запускает команду API contract generation с валидной синтаксической конфигурацией и недоступной базой
- **THEN** команда создаёт OpenAPI JSON с актуальными versioned paths и успешно завершается без database connection

#### Scenario: Contract drift в CI
- **WHEN** Nest OpenAPI metadata либо generated frontend output отличаются от закоммиченных артефактов
- **THEN** обязательная CI-проверка завершается ошибкой и показывает незакоммиченный drift

### Requirement: Типизированный TanStack Query client
Web MUST предоставлять сгенерированные из snapshot типы, fetch request functions и TanStack Query hooks для каждой документированной operation. Имена публичных generated operations MUST опираться на явные стабильные OpenAPI operation IDs, а runtime base URL MUST задаваться frontend environment.

#### Scenario: Вызов сгенерированного health hook
- **WHEN** client component вызывает сгенерированный health query hook внутри общего Query provider
- **THEN** web отправляет типизированный запрос к настроенному API base URL и предоставляет вызывающему коду типизированные loading, success и error states

#### Scenario: Недоступный API
- **WHEN** сгенерированный fetch request получает неуспешный HTTP status или network error
- **THEN** query переходит в error state, не интерпретируя ошибочный ответ как успешные данные

### Requirement: Согласованные MSW handlers
Web MUST генерировать MSW handlers из того же OpenAPI snapshot, использовать детерминированные examples без искусственной задержки и предоставлять один набор handlers для Vitest и browser development.

#### Scenario: Изолированный frontend-тест
- **WHEN** Vitest выполняет запрос через generated client
- **THEN** Node MSW server перехватывает запрос, возвращает соответствующий OpenAPI example и не обращается к внешней сети

#### Scenario: Необработанный API-запрос в тесте
- **WHEN** тест отправляет API-запрос, для которого не зарегистрирован handler
- **THEN** тест завершается ошибкой вместо незаметного обращения к реальному API

#### Scenario: Явно включённые browser mocks
- **WHEN** web запущен в development и публичный mocking flag равен `enabled`
- **THEN** browser worker запускается до монтирования query consumers и использует generated handlers

#### Scenario: Browser mocks выключены
- **WHEN** mocking flag не задан, выключен или web работает не в development
- **THEN** service worker не запускается и generated client обращается к реальному настроенному API

### Requirement: Credentialed Bearer transport web-клиента
Общий transport generated web-клиента MUST отправлять cross-origin cookie credentials, добавлять доступный in-memory access-токен в Bearer header и обновлять истёкший access-токен без ручного дублирования transport-контрактов endpoints.

При `401` защищённого запроса transport MUST выполнить не более одного refresh для всех одновременно ожидающих запросов, обновить access-токен и повторить каждый исходный запрос не более одного раза. Login, register и сам refresh MUST уметь отключить автоматический retry, чтобы не создавать refresh-loop.

#### Scenario: Авторизованный generated request
- **WHEN** generated operation выполняется при наличии access-токена
- **THEN** transport отправляет `credentials: include` и Bearer header с текущим токеном

#### Scenario: Параллельные ответы 401
- **WHEN** несколько защищённых запросов одновременно получают `401`
- **THEN** transport выполняет один refresh, после чего каждый запрос повторяется один раз с новым access-токеном

#### Scenario: Refresh не восстановил доступ
- **WHEN** single-flight refresh завершается `401`
- **THEN** transport очищает in-memory токен, уведомляет session lifecycle об unauthenticated состоянии и не повторяет refresh рекурсивно
