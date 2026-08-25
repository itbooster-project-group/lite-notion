## Why

Backend уже публикует email-регистрацию и session-backed аутентификацию, но web не умеет использовать эти сценарии: нет форм, восстановления сессии, Bearer transport, защиты маршрутов и пользовательского профиля. Из-за этого пользователь не может войти в приложение через браузер, а последующие приватные MVP-функции не имеют готовой frontend-границы авторизации.

## What Changes

- Добавить публичные экраны регистрации и входа с клиентской валидацией, безопасными ошибками и доступными loading-состояниями.
- Добавить in-memory access-токен, credentialed requests, single-flight refresh и однократный повтор защищённого запроса после `401`.
- Восстанавливать текущую сессию при запуске, различать loading, authenticated, unauthenticated и recoverable error состояния.
- Сделать `/` и `/profile` приватными, добавить безопасный возврат на запрошенный локальный маршрут и выход из текущей сессии.
- Отображать профиль из существующего `GET /api/v1/auth/me` только для чтения.
- Добавить React Hook Form, Zod и resolver для форм; покрыть transport, session lifecycle, маршруты и формы Vitest/RTL/MSW-тестами.
- Настроить узкие Steiger-исключения для app-only FSD slices и test-only imports, а отключения для prefixed `_app`/`_pages` явно оформить как временный workaround upstream-ошибки нормализации имён слоёв.
- Перевести Turbopack plugin evaluation на worker threads, чтобы production build не зависел от разрешения открывать локальные IPC sockets.
- Добавить минимальные shared UI primitives `Heading` и `Text`, вынести их размеры и line-height в семантические Tailwind typography tokens и использовать primitives для повторяющейся типографики auth, session и private screens без изменения семантической структуры.
- Оставить root App Router тонкой framework-границей: вынести композицию четырёх экранов в `src/_pages`, а auth/private route-group layouts — в `src/_app/layouts` с импортами только через public API.
- Упростить private header: логотип ведёт на главную, имя текущего пользователя — в профиль, отдельные ссылки «Главная» и «Профиль» удаляются.
- Не отслеживать generated `apps/web/next-env.d.ts` в Git и генерировать Next.js declarations перед web typecheck.
- Вне scope: редактирование профиля, backend/API/Prisma-изменения, logout со всех устройств, OAuth, MFA, восстановление пароля, страницы и совместное редактирование.

## Capabilities

### New Capabilities

- `web-authentication`: Наблюдаемые web-сценарии регистрации, входа, восстановления и завершения сессии, защиты маршрутов и просмотра текущего профиля.

### Modified Capabilities

- `generated-api-consumption`: Generated client получает общий credentialed Bearer transport с безопасным single-flight обновлением access-токена.

## Impact

- **Frontend:** новые FSD slices для session/auth, auth/profile UI и `_pages`; расширение `shared/api`, `shared/ui`, `_app/layouts` и application providers.
- **Tooling:** Steiger сохраняет recommended rules, но игнорирует spec-файлы, точечно допускает app-only slices и prefixed `_app`/`_pages`; workaround для префиксов пересматривается после обновлений FSD plugin/filesystem, web typecheck предварительно запускает Next.js type generation, а `next-env.d.ts` остаётся локальным generated-файлом.
- **Build:** Next.js сохраняет Turbopack, но выполняет PostCSS/loader plugins в worker threads вместо socket-based child processes.
- **Dependencies:** `react-hook-form`, `zod` и `@hookform/resolvers` добавляются только в `@lite-notion/web`; lockfile обновляется pnpm.
- **Backend и публичный HTTP API:** без изменений; используются существующие `/api/v1/auth/*` operations и generated client.
- **Безопасность:** refresh-токен остаётся HttpOnly cookie, access-токен хранится только в памяти, credentials не попадают в persistent/global state или логи.
