# api-runtime-foundation Specification

## Purpose

Определяет единый наблюдаемый контракт запуска и HTTP-поведения API, на который смогут безопасно опираться frontend и будущие backend-модули.

## Requirements

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

### Requirement: Версионированный health endpoint
Все прикладные HTTP-маршруты API MUST находиться под глобальным prefix `/api/v1`. Техническая проверка доступности MUST быть опубликована как `GET /api/v1/health`, проверять PostgreSQL и завершаться в ограниченное время без раскрытия деталей подключения или исходной database error.

#### Scenario: Успешная проверка доступности
- **WHEN** клиент отправляет `GET /api/v1/health` и PostgreSQL принимает запросы
- **THEN** API отвечает статусом `200` и JSON-объектом `{ "status": "ok", "database": "up" }`

#### Scenario: База данных недоступна
- **WHEN** клиент отправляет `GET /api/v1/health` и проверка PostgreSQL завершается ошибкой или timeout
- **THEN** API отвечает `503` в едином формате HTTP-ошибок с безопасным сообщением `Database is unavailable`

#### Scenario: Запрос прежнего health URL
- **WHEN** клиент отправляет `GET /health`
- **THEN** API отвечает статусом `404` в едином формате ошибок и не перенаправляет запрос

### Requirement: Ограниченный CORS-доступ
API MUST разрешать браузерные cross-origin запросы только для origin, точно совпадающего с `CORS_ORIGIN`, и MUST NOT разрешать wildcard origin. API MUST разрешать cross-origin credentials, чтобы браузер отправлял cookie аутентификации на эндпоинты обновления и выхода. Credentials MUST быть разрешены исключительно для точного совпадения с `CORS_ORIGIN` и MUST NOT сопровождаться wildcard значением `Access-Control-Allow-Origin`.

#### Scenario: Запрос с разрешённого frontend origin
- **WHEN** запрос или preflight содержит `Origin`, равный `CORS_ORIGIN`
- **THEN** ответ содержит `Access-Control-Allow-Origin` с этим точным значением и `Access-Control-Allow-Credentials: true`

#### Scenario: Запрос с другого origin
- **WHEN** запрос или preflight содержит любой другой `Origin`
- **THEN** ответ не предоставляет этому origin подходящее CORS-разрешение и не разрешает ему credentials

### Requirement: Глобальная валидация входных DTO
API MUST применять ко всем controller endpoints декларативную DTO-валидацию, преобразовывать допустимые значения к объявленным типам, учитывать только разрешённые DTO-поля и отклонять наличие любых лишних полей.

#### Scenario: Допустимый преобразуемый запрос
- **WHEN** endpoint получает DTO с допустимыми значениями, которые могут быть преобразованы к объявленным типам
- **THEN** controller получает валидированный и преобразованный экземпляр DTO

#### Scenario: Запрос с лишним полем
- **WHEN** endpoint получает DTO хотя бы с одним полем без разрешающего validation metadata
- **THEN** API отклоняет запрос статусом `400` в едином формате ошибок и перечисляет validation messages в поле `message`

### Requirement: Единый формат HTTP-ошибок
Каждая HTTP-ошибка MUST возвращаться как JSON-объект с полями `statusCode` типа number, `error` типа string, `message` типа string или string array, `path` с исходным URL запроса и `timestamp` в формате ISO 8601 UTC. Дополнительные исходные поля исключения MUST NOT изменять этот wire format.

#### Scenario: Ожидаемая HTTP-ошибка
- **WHEN** обработка запроса завершается ожидаемой HTTP-ошибкой, включая ошибки валидации и отсутствующие маршруты
- **THEN** API сохраняет соответствующий HTTP status и нормализует ответ в единый формат

#### Scenario: Неожиданная внутренняя ошибка
- **WHEN** обработчик выбрасывает неожиданное исключение
- **THEN** API отвечает статусом `500`, использует безопасные `error` и `message`, не раскрывает stack trace или внутренние данные клиенту и записывает исходную ошибку в серверный лог

### Requirement: Graceful shutdown
API MUST обрабатывать сигналы завершения процесса через lifecycle shutdown hooks, прекращать приём новых соединений и закрывать приложение после выполнения зарегистрированных lifecycle handlers.

#### Scenario: Получение сигнала завершения
- **WHEN** запущенный API получает поддерживаемый NestJS сигнал завершения, включая `SIGTERM` или `SIGINT`
- **THEN** приложение запускает shutdown lifecycle, закрывает HTTP-сервер и завершает процесс без принудительного обрыва активного lifecycle

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
