## 1. Зависимости и конфигурация окружения

- [x] 1.1 Добавить в `apps/api` runtime dependencies `@nestjs/config`, `@nestjs/swagger`, `class-transformer`, `class-validator`, dev dependencies `supertest`, `@types/supertest` и обновить `pnpm-lock.yaml` через pnpm.
- [x] 1.2 Реализовать типизированную env-схему с обязательными `NODE_ENV`, `PORT`, `CORS_ORIGIN`, замаппить её во внутренний camelCase-конфиг и подключить через глобальный cached `ConfigModule`.
- [x] 1.3 Добавить `apps/api/.env.example` с полным набором рекомендуемых локальных значений и unit tests для обязательности ключей, coercion, допустимых пользовательских значений и каждого невалидного случая.

## 2. Общий HTTP runtime

- [x] 2.1 Выделить тестируемую функцию настройки Nest application и подключить global prefix `api/v1`, single-origin CORS, глобальный `ValidationPipe` с утверждёнными options и shutdown hooks.
- [x] 2.2 Перевести bootstrap на получение единого типизированного config provider по DI-токену без строковых lookup отдельных полей и добавить безопасную обработку startup failure с ненулевым exit code при отсутствующей или невалидной конфигурации.
- [x] 2.3 Реализовать DI-managed global exception filter с фиксированным `{ statusCode, error, message, path, timestamp }`, сохранением validation messages и безопасным логированием неожиданных исключений.
- [x] 2.4 Добавить HTTP tests для versioned routing, разрешённого и запрещённого CORS, DTO transform, запрета лишних полей и единого формата `400`, `404`, `500`; проверить bootstrap port и shutdown setup.

## 3. Health и OpenAPI

- [x] 3.1 Перенести публичный health contract на `GET /api/v1/health` без alias и добавить явные Swagger decorators для tag, operation и успешного response schema.
- [x] 3.2 Настроить вне production Swagger UI `/api/docs` и lazy OpenAPI document `Lite Notion API` version `1.0` на `/api/openapi.json`, публикуя только JSON и сохраняя `/api/v1` paths в схеме.
- [x] 3.3 Обновить unit/HTTP tests health и добавить проверки Swagger UI, OpenAPI JSON, отсутствия YAML и отсутствия всех documentation endpoints при `NODE_ENV=production`.

## 4. Документация и проверки

- [x] 4.1 Обновить русскоязычный README: подготовка env-файла, переменные, запуск, новый health URL, Swagger UI, OpenAPI JSON и production-ограничение.
- [x] 4.2 Актуализировать `apps/api/AGENTS.md`: убрать устаревшее утверждение об отсутствии Swagger и закрепить новый bootstrap/configuration contract на английском языке.
- [x] 4.3 Выполнить `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` и исправить все регрессии в пределах change.
- [x] 4.4 Выполнить `openspec validate configure-api-foundation --strict` и подтвердить, что все артефакты и требования change согласованы перед передачей на human review.

## 5. Архитектурная граница health

- [x] 5.1 Создать компактный `HealthModule`, перенести в его каталог health controller и co-located unit test, импортировать модуль в `AppModule` вместо прямой регистрации controller.
- [x] 5.2 Подтвердить неизменность health/OpenAPI контрактов через unit и HTTP tests, затем повторно выполнить полный root check set и `openspec validate configure-api-foundation --strict`.
