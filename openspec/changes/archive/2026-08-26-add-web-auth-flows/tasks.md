## 1. Dependencies and transport

- [x] 1.1 Добавить в web `react-hook-form`, `zod` и `@hookform/resolvers` через pnpm и обновить lockfile.
- [x] 1.2 Реализовать in-memory access-token boundary, registration refresh/expiry callbacks и single-flight refresh без persistent storage.
- [x] 1.3 Расширить `apiFetch`: credentials include, Bearer header, типизированный `skipAuthRefresh`, безопасный parse ошибок и однократный retry после `401`.
- [x] 1.4 Покрыть transport unit-тестами: credentials/header, параллельный single-flight, retry once и окончательный `401`.

## 2. Session lifecycle and routing

- [x] 2.1 Реализовать FSD entity `session` с provider/hook, bootstrap refresh → current user и TanStack Query как единственным profile cache.
- [x] 2.2 Подключить session provider после готовности development MSW и добавить loading/error/unauthenticated/authenticated transitions с retry.
- [x] 2.3 Реализовать private/auth guards, whitelist `/` и `/profile` для `next` и App Router route groups.
- [x] 2.4 Покрыть bootstrap и guards RTL/MSW-тестами для success, `401`, recoverable error, retry и redirects.

## 3. Auth forms

- [x] 3.1 Реализовать Zod schemas для login/register, включая trim/normalization, confirmation и 72 UTF-8 byte limit, с unit-тестами границ.
- [x] 3.2 Реализовать доступные React Hook Form login/register features через imperative generated functions без mutation cache и сырых API messages.
- [x] 3.3 Покрыть формы RTL/MSW-тестами: client validation, success redirect, login `401`, register `409`, pending и generic failure.

## 4. Private UI and completion

- [x] 4.1 Создать приватную welcome-главную, добавить private navigation и logout текущей сессии с безопасной обработкой ошибок.
- [x] 4.2 Добавить read-only `/profile` с данными текущего пользователя и покрыть profile/logout observable behavior тестами.
- [x] 4.3 Выполнить strict OpenSpec validation, frontend FSD check и обязательные `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; устранить найденные ошибки без изменения scope.
- [x] 4.4 Упростить `HomePage` и `ProfileView`: на главной оставить только персонализированный heading, а в профиле — заголовок и простой семантический список `name`, `email` и форматированного `createdAt` без описания, карточной стилизации и `id`; обновить оба RTL-теста наблюдаемого поведения.
- [x] 4.5 Повторно выполнить strict OpenSpec validation, frontend FSD check и обязательные `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## 5. Shared UI typography

- [x] 5.1 Добавить типизированные `Heading` и `Text` primitives в `shared/ui` с вариантами из design, forwarding DOM props и RTL-тестами semantic tag, role и class merging.
- [x] 5.2 Перевести повторяющиеся headings, descriptions, loading и error states auth/session/private UI на новые primitives без изменения accessibility и layout.

## 6. Thin App Router and completion

- [x] 6.1 Вынести `/`, `/login`, `/register` и `/profile` в отдельные `_pages` slices с `ui` segments/public APIs, сохранить `HomePage` client boundary и покрыть welcome behavior RTL-тестом.
- [x] 6.2 Вынести auth/private route-group composition в `_app/layouts`, сделать route entrypoints тонкими imports/default exports и документировать `_pages` convention в frontend `AGENTS.md` со scoped Steiger exception.
- [x] 6.3 Повторно выполнить strict OpenSpec validation, frontend FSD check и обязательные `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## 7. Private header navigation

- [x] 7.1 Реализовать private header с brand-link `/` и видимым на всех viewport username-link `/profile` с truncate/fallback без отдельных ссылок «Главная»/«Профиль» и покрыть `PrivateShell` RTL-тестом.
- [x] 7.2 Повторно выполнить strict OpenSpec validation, frontend FSD check и обязательные `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## 8. Generated Next declarations

- [x] 8.1 Добавить `apps/web/next-env.d.ts` в root `.gitignore`, убрать файл из Git index без изменения working copy, добавить `pretypecheck: next typegen` и задокументировать generated-file contract в frontend `AGENTS.md`.
- [x] 8.2 Проверить ignore/tracking state и повторно выполнить strict OpenSpec validation, frontend FSD check и обязательные `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## 9. Semantic application styles

- [x] 9.1 Перенести global style entrypoint в `src/_app/styles`, разделить theme, spacing и typography responsibilities, исправить shadcn CSS path и перевести application composition на семантические Tailwind spacing/container tokens без изменения текущей геометрии.
- [x] 9.2 Обновить frontend styling guidance и style-sensitive tests, проверить отсутствие числовых spacing/container utilities в application composition и повторно выполнить strict OpenSpec validation, frontend FSD check, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` и `git diff --check`.

## 10. Prefixed FSD layer workaround

- [x] 10.1 Сохранить `_app` и `_pages`, явно оформить связанные точечные Steiger-исключения как workaround upstream-ошибки нормализации префиксов и задокументировать их пересмотр после обновления FSD plugin/filesystem.
- [x] 10.2 Выполнить strict OpenSpec validation, frontend FSD check, `pnpm lint` и `git diff --check`, не изменяя generated `apps/web/next-env.d.ts`.

## 11. Semantic container regression

- [x] 11.1 Устранить Tailwind namespace collision между spacing и container `content`: переименовать общий 64rem container в `shell`, обновить private header/home/profile и добавить регрессионный тест с реальной компиляцией semantic utilities.
- [x] 11.2 Выполнить strict OpenSpec validation, frontend FSD check, web tests/typecheck/build, `pnpm lint` и `git diff --check`, не редактируя generated `apps/web/next-env.d.ts`.

## 12. Semantic typography tokens

- [x] 12.1 Добавить semantic font-size/line-height tokens для `Heading` и `Text`, расширить `tailwind-merge` для корректного class override, обновить frontend guidance и покрыть theme compilation и primitives тестами без изменения текущей типографики.
- [x] 12.2 Выполнить strict OpenSpec validation, frontend FSD check, web tests/typecheck/build, `pnpm lint` и `git diff --check`, не редактируя generated `apps/web/next-env.d.ts`.

## 13. Review fixes

- [x] 13.1 Добавить auth generation и привязанный к generation/configuration refresh-flight; исключить повторный refresh для запоздалого `401`, устаревшие token/callback commits и очистку нового flight старым `finally`.
- [x] 13.2 Защитить `SessionProvider` от superseded restore completion и покрыть transport/provider гонки deferred-promise тестами.
- [x] 13.3 Сохранять allowlisted `next` при переходе login ↔ register и покрыть безопасные/небезопасные адреса RTL/unit-тестами.
- [x] 13.4 Перейти с `_app`/`_pages` на канонические `app`/`pages`, перенести guards в `app/routing`, удалить `profile-view` widget и связанные Steiger workaround.
- [x] 13.5 Сократить spacing/container theme до `page-inline`, `page-block`, `shell`, `auth`; вернуть локальную геометрию на Tailwind scale и убрать height overrides из Button/Input wrappers с регрессионными тестами.
- [x] 13.6 Обновить frontend guidance/config paths и выполнить strict OpenSpec validation, Steiger, lint, typecheck, tests, build и `git diff --check` без архивации change.
