## MODIFIED Requirements

### Requirement: Валидируемая конфигурация окружения
API MUST требовать и при запуске валидировать `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, `DATABASE_CONNECTION_TIMEOUT_MS`, `JWT_SECRET`, `ACCESS_TOKEN_TTL_S`, `REFRESH_TOKEN_TTL_S` и `BCRYPT_ROUNDS`, преобразовывать числовые значения и не начинать принимать HTTP-запросы при отсутствующей или невалидной конфигурации. Допустимыми значениями `NODE_ENV` MUST быть `development`, `test` и `production`; `PORT` MUST быть целым числом от 1 до 65535; `CORS_ORIGIN` MUST быть HTTP(S) origin без path, query и fragment; `DATABASE_URL` MUST использовать protocol `postgresql` или `postgres`; `DATABASE_CONNECTION_TIMEOUT_MS` MUST быть положительным целым числом с установленной верхней границей; `JWT_SECRET` MUST быть непустой строкой длиной не менее 32 символов; `ACCESS_TOKEN_TTL_S` и `REFRESH_TOKEN_TTL_S` MUST быть положительными целыми числами с установленными верхними границами, причём `REFRESH_TOKEN_TTL_S` MUST быть строго больше `ACCESS_TOKEN_TTL_S`; `BCRYPT_ROUNDS` MUST быть целым числом от 4 до 15.

Сообщение об ошибке конфигурации MUST NOT содержать значение `JWT_SECRET`.

#### Scenario: Запуск с локальной конфигурацией из шаблона
- **WHEN** environment содержит все обязательные значения из локального `.env`, созданного по `.env.example`
- **THEN** API запускается в development, слушает настроенный порт и использует настроенные frontend origin, database URL, connection timeout, ключ подписи токенов, сроки жизни токенов и стоимость bcrypt

#### Scenario: Запуск с допустимой пользовательской конфигурацией
- **WHEN** все обязательные переменные содержат допустимые пользовательские значения
- **THEN** API использует эти значения, включая числовые значения порта, database connection timeout, сроков жизни токенов и стоимости bcrypt

#### Scenario: Отказ запуска при отсутствующей конфигурации
- **WHEN** хотя бы одна обязательная переменная не задана
- **THEN** API не начинает слушать порт, завершает запуск с ненулевым кодом и сообщает безопасную ошибку для отсутствующего ключа без дампа окружения

#### Scenario: Отказ запуска при невалидной конфигурации
- **WHEN** хотя бы одна контролируемая переменная окружения не соответствует своему контракту
- **THEN** API не начинает слушать порт, завершает запуск с ненулевым кодом и сообщает только безопасное описание ошибок конфигурации без дампа окружения, database credentials или значения ключа подписи токенов

#### Scenario: Отказ запуска при слабом ключе подписи
- **WHEN** `JWT_SECRET` не задан либо короче 32 символов
- **THEN** API не начинает слушать порт, завершает запуск с ненулевым кодом и сообщает только имя и безопасное описание невалидной настройки

#### Scenario: Отказ запуска при противоречивых сроках жизни токенов
- **WHEN** `REFRESH_TOKEN_TTL_S` меньше либо равен `ACCESS_TOKEN_TTL_S`
- **THEN** API не начинает слушать порт и сообщает безопасное описание несогласованной настройки

### Requirement: Ограниченный CORS-доступ
API MUST разрешать браузерные cross-origin запросы только для origin, точно совпадающего с `CORS_ORIGIN`, и MUST NOT разрешать wildcard origin. API MUST разрешать cross-origin credentials, чтобы браузер отправлял cookie аутентификации на эндпоинты обновления и выхода. Credentials MUST быть разрешены исключительно для точного совпадения с `CORS_ORIGIN` и MUST NOT сопровождаться wildcard значением `Access-Control-Allow-Origin`.

#### Scenario: Запрос с разрешённого frontend origin
- **WHEN** запрос или preflight содержит `Origin`, равный `CORS_ORIGIN`
- **THEN** ответ содержит `Access-Control-Allow-Origin` с этим точным значением и `Access-Control-Allow-Credentials: true`

#### Scenario: Запрос с другого origin
- **WHEN** запрос или preflight содержит любой другой `Origin`
- **THEN** ответ не предоставляет этому origin подходящее CORS-разрешение и не разрешает ему credentials

### Requirement: Непроизводственная OpenAPI-документация
При `NODE_ENV`, отличном от `production`, API MUST публиковать Swagger UI на `/api/docs` и только OpenAPI JSON на `/api/openapi.json`. Документ MUST иметь title `Lite Notion API`, version `1.0`, учитывать глобальный prefix и описывать каждую опубликованную operation, её документированные ответы и стабильный явный operation ID. Документ MUST объявлять bearer-схему безопасности для access-токена и помечать ею защищённые operations. Swagger endpoints MUST находиться вне `/api/v1`.

#### Scenario: Просмотр Swagger UI вне production
- **WHEN** API запущен в `development` или `test` и клиент открывает `/api/docs`
- **THEN** клиент получает Swagger UI, настроенный на опубликованный OpenAPI JSON, с возможностью задать bearer-токен

#### Scenario: Получение OpenAPI JSON вне production
- **WHEN** API запущен в `development` или `test` и клиент запрашивает `/api/openapi.json`
- **THEN** клиент получает валидный JSON-документ, где каждый опубликованный path имеет явный operation ID и документированные response schemas, включая health path `/api/v1/health` с operation ID `getHealth` и ответами `200` и `503`

#### Scenario: Документирование защищённых операций
- **WHEN** клиент читает опубликованный OpenAPI JSON
- **THEN** документ объявляет bearer-схему безопасности, помечает ею операции, требующие аутентификации, и документирует для них ответ `401`

#### Scenario: YAML-представление не опубликовано
- **WHEN** клиент запрашивает Swagger-derived YAML endpoint
- **THEN** API отвечает статусом `404` в едином формате ошибок

#### Scenario: Документация недоступна в production
- **WHEN** API запущен с `NODE_ENV=production` и клиент запрашивает `/api/docs` или `/api/openapi.json`
- **THEN** API отвечает статусом `404` в едином формате ошибок
