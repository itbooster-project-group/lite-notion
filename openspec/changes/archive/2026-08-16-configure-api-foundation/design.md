## Context

См. `proposal.md` — Why. Сейчас `apps/api` содержит один `AppModule`, health controller и bootstrap, который напрямую читает `process.env.PORT`. Общих инфраструктурных модулей, HTTP-level тестов и runtime dependencies для конфигурации, DTO-валидации или OpenAPI нет. Команды pnpm запускают каждый workspace package с его собственным working directory, поэтому локальный env-файл API должен находиться в `apps/api`.

Изменение затрагивает bootstrap, dependency injection, HTTP request lifecycle и публичные маршруты, поэтому общую настройку нужно сделать один раз до появления продуктовых модулей. База данных, realtime и авторизация отсутствуют; изменений схемы данных и событий нет.

## Goals / Non-Goals

**Goals:**

- Сделать конфигурацию запуска типизированной, валидируемой и доступной через DI.
- Сконцентрировать общие HTTP-настройки в повторно используемой и тестируемой функции конфигурации приложения.
- Нормализовать ошибки на границе HTTP, не раскрывая внутренние исключения.
- Публиковать минимальную актуальную OpenAPI-схему вне production.
- Закрепить health endpoint за отдельным техническим NestJS-модулем, сохранив `AppModule` composition root.
- Проверять routing, middleware, pipes, filters и Swagger на HTTP-уровне без внешних сервисов.

**Non-Goals:**

- Создание универсальной библиотеки конфигурации или shared package.
- Добавление auth-схемы в OpenAPI, Swagger CLI plugin или автоматических decorators для будущих DTO.
- Поддержка нескольких CORS origins, credentials или runtime-переключения Swagger.
- Добавление database/realtime lifecycle handlers; инфраструктура лишь готовит стандартный shutdown path для будущих providers.
- Создание пустых `domain`, `application`, `infrastructure` слоёв или health service/use-case без бизнес-поведения.

## Decisions

### Глобальный ConfigModule и одна схема окружения

`AppModule` импортирует `ConfigModule.forRoot` с `isGlobal: true`, caching и зарегистрированным config factory. После загрузки `.env` factory передаёт `process.env` единой validate-функции, которая требует контролируемые ключи `NODE_ENV`, `PORT` и `CORS_ORIGIN`, преобразует их и проверяет через `class-transformer` и `class-validator`; остальные переменные процесса не запрещаются и сохраняются для совместимости с Node/tooling.

Валидированные env-ключи один раз маппятся во внутренний типизированный `ApplicationConfig` с полями `nodeEnvironment`, `port` и `corsOrigin`. Factory регистрирует этот объект за собственным DI-токеном, поэтому consumers получают конфигурацию целиком и не выполняют строковые lookup отдельных полей через `ConfigService`.

`NODE_ENV` моделируется enum со значениями `development`, `test`, `production`. `PORT` преобразуется из строки и проверяется как integer в диапазоне 1–65535. Для `CORS_ORIGIN` отдельная проверка на основе WHATWG `URL` допускает только `http:`/`https:` и требует, чтобы значение было точным origin без path, query, fragment или завершающего slash. Ошибка агрегирует только имена ключей и validation constraints, не сериализует исходный config.

Runtime-defaults отсутствуют: локальный разработчик копирует `apps/api/.env.example` в `.env`, а CI и production могут передать те же обязательные ключи через environment процесса без физического файла. Значения `development`, `3001` и `http://localhost:3000` принадлежат только локальному шаблону и не используются приложением как fallback.

Альтернатива Joi отклонена: `class-validator` и `class-transformer` уже обязательны для глобального `ValidationPipe`, поэтому отдельная schema dependency не нужна. Прямое чтение `process.env` вне config factory отклонено из-за отсутствия преобразования, единой валидации и типизированного DI.

### Тестируемая конфигурация Nest application

Bootstrap создаёт приложение с контролируемой обработкой startup errors, получает по DI-токену типизированный `ApplicationConfig` и передаёт приложение в отдельную функцию настройки. Функция до `listen`:

1. устанавливает global prefix `api/v1`;
2. включает CORS для точного `corsOrigin` с `credentials: false`;
3. регистрирует `ValidationPipe` с `whitelist`, `transform` и `forbidNonWhitelisted`;
4. включает shutdown hooks;
5. условно настраивает Swagger.

Порт читается из поля `port` единого runtime-конфига. Верхняя граница bootstrap перехватывает ошибку, логирует безопасное сообщение и устанавливает ненулевой exit code. Выделенная функция позволяет тестировать вызовы bootstrap-настроек и собирать HTTP test application без запуска production entrypoint.

Альтернатива оставить всю настройку в `main.ts` отклонена, поскольку потребовала бы тестировать её через отдельный OS process или дублировать настройки в тестах.

### Global prefix без compatibility alias

Prefix применяется ко всем controller routes, поэтому `@Controller("health")` автоматически становится `/api/v1/health`. Исключение health из prefix или второй controller для `/health` не добавляются: перенос намеренно breaking и должен сразу обнаружить устаревших consumers.

Swagger UI и raw document монтируются отдельными техническими routes `/api/docs` и `/api/openapi.json`; для них не включается `useGlobalPrefix`. OpenAPI document создаётся после установки prefix и не игнорирует его, поэтому path health в схеме остаётся `/api/v1/health`.

### Компактный HealthModule

`HealthController` и его unit test размещаются рядом внутри каталога `health`, а `HealthModule` единолично регистрирует controller. Корневой `AppModule` импортирует `HealthModule` вместо прямой регистрации controller, поэтому техническая функциональность имеет явную module boundary, а composition root отвечает только за сборку приложения и глобальную инфраструктуру.

У health endpoint нет бизнес-правил, orchestration или внешних dependencies, поэтому service/use-case и пустые layered subdirectories не создаются. Когда health начнёт агрегировать проверки базы данных или других providers, соответствующее поведение должно появиться в module providers отдельным одобренным изменением.

### Глобальная валидация на HTTP-границе

Один `ValidationPipe` применяется в bootstrap ко всем controllers с точными options из specification. DTO продолжают явно объявлять validation metadata; преобразование primitive values, когда оно нужно, задаётся metadata DTO, а не небезопасным глобальным implicit conversion.

HTTP-тест использует test-only controller и DTO, чтобы доказать работу transform и запрет неизвестных полей, не добавляя искусственный production endpoint.

### DI-managed exception filter

Exception filter регистрируется через provider token `APP_FILTER`, чтобы иметь доступ к `HttpAdapterHost` и Nest logger. Для `HttpException` filter сохраняет status и нормализует `error`/`message` из строкового или объектного response; недостающие значения заполняются стандартным названием HTTP status. `message` остаётся строкой либо массивом строк, чтобы не потерять стандартные сообщения `ValidationPipe`.

Для неизвестных исключений filter возвращает только `500`, `Internal Server Error` и безопасное сообщение, а исходный объект/stack передаёт Nest logger. Ответ строится через HTTP adapter и всегда ограничивается полями `statusCode`, `error`, `message`, `path`, `timestamp`.

Альтернатива interceptor отклонена: exception filter является штатной границей NestJS для ошибок и корректно обрабатывает routing `404` и исключения framework pipeline.

### Swagger только вне production

При `NODE_ENV !== production` `DocumentBuilder` задаёт title `Lite Notion API`, description и version `1.0`. `SwaggerModule.setup` монтирует UI на `/api/docs`, задаёт `jsonDocumentUrl: "/api/openapi.json"` и `raw: ["json"]`, чтобы не публиковать YAML. Используется lazy document factory.

Health controller получает явные OpenAPI decorators для tag, operation и response schema `{ status: "ok" }`; Swagger CLI plugin не включается. При production setup вообще не вызывается, поэтому UI, assets и raw schema отсутствуют и проходят через обычный унифицированный `404`.

Альтернатива env-флагу `SWAGGER_ENABLED` отклонена: выбранный контракт зависит только от валидируемого `NODE_ENV` и не создаёт дополнительного состояния конфигурации. Защита Swagger авторизацией не нужна, поскольку production endpoints отсутствуют, а в development/test документация предназначена разработчикам.

### Зависимости и документация

`apps/api` напрямую объявляет runtime dependencies `@nestjs/config`, `@nestjs/swagger`, `class-transformer`, `class-validator` и dev dependencies `supertest`, `@types/supertest`; lockfile обновляется pnpm. Зависимости остаются app-specific и не выносятся в catalog, пока второго consumer нет.

`apps/api/.env.example` содержит полный набор рекомендуемых локальных значений. README требует подготовить локальный env-файл или передать переменные через environment процесса, описывает переменные и непроизводственные documentation endpoints. `apps/api/AGENTS.md` перестаёт утверждать, что Swagger отсутствует, и фиксирует новый стабильный bootstrap contract.

### Стратегия тестирования

- Unit tests вызывают env validate-функцию и config mapper напрямую, проверяя обязательность каждого ключа, coercion, значения шаблона, пользовательские значения, внутренний camelCase-контракт и безопасные ошибки для каждого невалидного поля.
- Unit test собирает минимальный testing module только с health controller; HTTP tests импортируют `AppModule`, применяют production setup-функцию и используют Supertest против in-memory HTTP server для module wiring, prefix, health, CORS, validation и error filter.
- Swagger tests собирают приложения с development и production config: проверяют UI, JSON document, отсутствие YAML, path health и отсутствие documentation routes в production.
- Bootstrap-focused unit test подменяет типизированный config provider для подтверждения runtime-порта и shutdown setup; все созданные Nest applications закрываются после тестов, чтобы не оставлять signal listeners.

## Risks / Trade-offs

- **Breaking health URL может сломать локальные проверки доступности** → README и тесты обновляются в том же change; alias намеренно не предоставляется.
- **Single-origin CORS не поддерживает preview deployments** → контракт остаётся минимальным; переход к списку origins требует отдельного требования и change.
- **Swagger UI увеличивает dev/test startup и dependency footprint** → документ создаётся lazy factory и полностью отсутствует в production.
- **Global exception filter может скрыть полезные custom response fields будущих модулей** → wire format намеренно фиксирован; структурированные продуктовые error details должны проектироваться отдельным изменением.
- **Shutdown hooks добавляют process signal listeners в тестах** → тестовые приложения всегда закрываются, а unit tests изолируют bootstrap configuration.
- **Отсутствующая env-переменная блокирует запуск** → API намеренно падает до открытия порта; `.env.example`, README и контролируемый test env поддерживают полный набор ключей.

## Migration Plan

1. Добавить зависимости и env schema с обязательными ключами, зарегистрировать маппинг в типизированный `ApplicationConfig`, затем перевести bootstrap на его DI-токен; рекомендуемый локальный порт 3001 оставить только в `.env.example`.
2. Подключить общие HTTP-настройки, error filter и Swagger, вынести health controller в `HealthModule`, после чего обновить health contract и тесты атомарно.
3. Обновить README и agent guidance до merge; consumers переключаются с `/health` на `/api/v1/health`.
4. Перед merge проверить development endpoints и production-отсутствие Swagger, выполнить строгую OpenSpec-валидацию и полный root check set.

Rollback выполняется откатом change целиком: он возвращает прежний `/health` и прямое чтение `PORT`. Миграций данных и внешнего состояния нет.
