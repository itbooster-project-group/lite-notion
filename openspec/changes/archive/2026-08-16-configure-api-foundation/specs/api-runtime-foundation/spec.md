## Purpose

Определяет единый наблюдаемый контракт запуска и HTTP-поведения API, на который смогут безопасно опираться frontend и будущие backend-модули.

## ADDED Requirements

### Requirement: Валидируемая конфигурация окружения
API MUST требовать и при запуске валидировать `NODE_ENV`, `PORT` и `CORS_ORIGIN`, преобразовывать порт в число и не начинать принимать HTTP-запросы при отсутствующей или невалидной конфигурации. Допустимыми значениями `NODE_ENV` MUST быть `development`, `test` и `production`; `PORT` MUST быть целым числом от 1 до 65535; `CORS_ORIGIN` MUST быть HTTP(S) origin без path, query и fragment.

#### Scenario: Запуск с локальной конфигурацией из шаблона
- **WHEN** environment содержит `NODE_ENV=development`, `PORT=3001` и `CORS_ORIGIN=http://localhost:3000` из локального `.env`, созданного по `.env.example`
- **THEN** API запускается в development, слушает порт `3001` и разрешает origin `http://localhost:3000`

#### Scenario: Запуск с допустимой пользовательской конфигурацией
- **WHEN** все три переменные содержат допустимые пользовательские значения
- **THEN** API использует эти значения, включая числовое значение настроенного порта

#### Scenario: Отказ запуска при отсутствующей конфигурации
- **WHEN** хотя бы одна из переменных `NODE_ENV`, `PORT` или `CORS_ORIGIN` не задана
- **THEN** API не начинает слушать порт, завершает запуск с ненулевым кодом и сообщает безопасную ошибку для отсутствующего ключа без дампа окружения

#### Scenario: Отказ запуска при невалидной конфигурации
- **WHEN** хотя бы одна контролируемая переменная окружения не соответствует своему контракту
- **THEN** API не начинает слушать порт, завершает запуск с ненулевым кодом и сообщает только безопасное описание ошибок конфигурации без дампа окружения

### Requirement: Версионированный health endpoint
Все прикладные HTTP-маршруты API MUST находиться под глобальным prefix `/api/v1`. Техническая проверка доступности MUST быть опубликована только как `GET /api/v1/health`.

#### Scenario: Успешная проверка доступности
- **WHEN** клиент отправляет `GET /api/v1/health`
- **THEN** API отвечает статусом `200` и JSON-объектом `{ "status": "ok" }`

#### Scenario: Запрос прежнего health URL
- **WHEN** клиент отправляет `GET /health`
- **THEN** API отвечает статусом `404` в едином формате ошибок и не перенаправляет запрос

### Requirement: Ограниченный CORS-доступ
API MUST разрешать браузерные cross-origin запросы только для origin, точно совпадающего с `CORS_ORIGIN`, и MUST NOT разрешать cross-origin credentials или wildcard origin.

#### Scenario: Запрос с разрешённого frontend origin
- **WHEN** запрос или preflight содержит `Origin`, равный `CORS_ORIGIN`
- **THEN** ответ содержит `Access-Control-Allow-Origin` с этим точным значением

#### Scenario: Запрос с другого origin
- **WHEN** запрос или preflight содержит любой другой `Origin`
- **THEN** ответ не предоставляет этому origin подходящее CORS-разрешение

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
При `NODE_ENV`, отличном от `production`, API MUST публиковать Swagger UI на `/api/docs` и только OpenAPI JSON на `/api/openapi.json`. Документ MUST иметь title `Lite Notion API`, version `1.0`, учитывать глобальный prefix и описывать health operation и её успешный ответ. Swagger endpoints MUST находиться вне `/api/v1`.

#### Scenario: Просмотр Swagger UI вне production
- **WHEN** API запущен в `development` или `test` и клиент открывает `/api/docs`
- **THEN** клиент получает Swagger UI, настроенный на опубликованный OpenAPI JSON

#### Scenario: Получение OpenAPI JSON вне production
- **WHEN** API запущен в `development` или `test` и клиент запрашивает `/api/openapi.json`
- **THEN** клиент получает валидный JSON-документ OpenAPI с path `/api/v1/health` и схемой его ответа `200`

#### Scenario: YAML-представление не опубликовано
- **WHEN** клиент запрашивает Swagger-derived YAML endpoint
- **THEN** API отвечает статусом `404` в едином формате ошибок

#### Scenario: Документация недоступна в production
- **WHEN** API запущен с `NODE_ENV=production` и клиент запрашивает `/api/docs` или `/api/openapi.json`
- **THEN** API отвечает статусом `404` в едином формате ошибок
