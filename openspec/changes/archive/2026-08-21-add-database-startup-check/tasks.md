## 1. Стартовая проверка подключения

- [x] 1.1 В `apps/api/src/database/prisma.service.ts` добавить приватный `Logger` с контекстом сервиса и реализовать `OnModuleInit`, который вызывает существующий `checkConnection()`; проверить `pnpm --filter api typecheck` без ошибок
- [x] 1.2 В `onModuleInit` логировать успех через `Logger.log` фиксированным сообщением о готовности базы; проверить, что сообщение не содержит connection URL и credentials
- [x] 1.3 В `onModuleInit` перехватывать ошибку `checkConnection()` и логировать её через `Logger.warn` фиксированным безопасным текстом без исходной ошибки, не пробрасывая исключение; проверить, что `onModuleInit` резолвится при падающем `checkConnection()`

## 2. Тесты

- [x] 2.1 В `apps/api/src/database/prisma.service.spec.ts` добавить тест успешного пути: `checkConnection` замокан на успех, `onModuleInit` вызывает его один раз и пишет в `Logger.log`; проверить `pnpm --filter api test`
- [x] 2.2 Добавить тест неуспешного пути: `checkConnection` замокан на reject, `onModuleInit` не выбрасывает, пишет в `Logger.warn`, и залогированное сообщение не содержит `databaseUrl` из тестового config; проверить `pnpm --filter api test`

## 3. Проверка результата

- [x] 3.1 Запустить API при поднятом PostgreSQL и убедиться, что стартовый лог содержит подтверждение подключения, а `GET /api/v1/health` отвечает `200` с `{ "status": "ok", "database": "up" }`
- [x] 3.2 Запустить API при остановленном PostgreSQL и убедиться, что в логе есть предупреждение, процесс продолжает работу и слушает настроенный порт, а `GET /api/v1/health` отвечает `503` с сообщением `Database is unavailable` (проверено через `DATABASE_URL` на порт без listener, без остановки контейнера)
- [x] 3.3 Прогнать `pnpm --filter api typecheck` и `pnpm --filter api test` и убедиться, что существующие тесты `PrismaService`, `HealthService` и bootstrap не сломались
