## Why

Текущий NestJS API запускается с прямым чтением `process.env`, не валидирует окружение и не имеет общего HTTP-контракта для версионирования, CORS, входных данных, ошибок и документации. До появления продуктовых модулей нужно закрепить единую безопасную основу запуска и публичного API, чтобы последующие endpoints не настраивали эти обязанности разрозненно.

## What Changes

- Подключить глобальную типизированную конфигурацию окружения с проверкой `NODE_ENV`, `PORT` и `CORS_ORIGIN`, безопасной ошибкой запуска и примером `.env`.
- Установить общий prefix `/api/v1`, разрешить CORS только для настроенного frontend origin и включить глобальную валидацию DTO с преобразованием и запретом лишних полей.
- Ввести единый Nest-подобный формат HTTP-ошибок и скрывать внутренние детали неожиданных сбоев.
- Включить graceful shutdown через lifecycle hooks NestJS.
- **BREAKING** Перенести health endpoint с `/health` на `/api/v1/health` без совместимого alias.
- Подключить OpenAPI и Swagger UI на `/api/docs`, публиковать только JSON-схему на `/api/openapi.json` и отключать оба endpoint в production.
- Добавить HTTP- и конфигурационные тесты, обновить README и backend agent guidance.
- Не включать базу данных, Redis, очереди, realtime, авторизацию, Swagger CLI plugin и продуктовые DTO или endpoints.

## Capabilities

### New Capabilities

- `api-runtime-foundation`: Единый контракт запуска и HTTP-поведения NestJS API, включая конфигурацию окружения, versioned routes, CORS, валидацию, ошибки, graceful shutdown, health и OpenAPI-документацию.

### Modified Capabilities

Нет.

## Impact

- **Backend:** bootstrap и корневой модуль NestJS, отдельный `HealthModule` с health controller, общая конфигурация, pipes и exception filter.
- **Публичный API:** health переезжает на `/api/v1/health`; появляются непроизводственные endpoints `/api/docs` и `/api/openapi.json`; ошибки получают единый wire format.
- **Frontend:** код не меняется; локальный origin `http://localhost:3000` становится разрешённым значением по умолчанию.
- **Зависимости и tooling:** добавляются Nest config/Swagger, библиотеки валидации и HTTP test tooling; обновляется lockfile.
- **Документация:** обновляются README и scoped правила API. Инфраструктура развертывания и схемы данных не затрагиваются.
