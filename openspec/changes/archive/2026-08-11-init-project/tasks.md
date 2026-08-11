## 1. Основа workspace

- [x] 1.1 Создать корневые `package.json` и `pnpm-workspace.yaml` с `private: true`, Node.js 22, pnpm 11.21.0 и workspace-паттерном `apps/*`.
- [x] 1.2 Добавить корневые scripts `dev`, `build`, `lint`, `format`, `typecheck` и `test`, используя pnpm для параллельного или рекурсивного запуска приложений.
- [x] 1.3 Добавить общий `tsconfig.base.json` со strict-настройками и отдельными framework-specific переопределениями в приложениях.
- [x] 1.4 Настроить корневой Biome для проверки workspace и исключить зависимости, build-артефакты и coverage.
- [x] 1.5 Добавить `.gitignore` для pnpm, Next.js, NestJS, тестовых артефактов, IDE и локальных environment-файлов.

## 2. Frontend-приложение

- [x] 2.1 Создать `apps/web` как минимальное Next.js-приложение с TypeScript, `src/app`, App Router и package scripts для dev, build, typecheck и test.
- [x] 2.2 Добавить минимальные layout и стартовую страницу без Tailwind, shadcn/ui и продуктовых компонентов.
- [x] 2.3 Настроить Vitest с jsdom, React Testing Library и DOM matchers для web.
- [x] 2.4 Добавить тест стартовой страницы, проверяющий отображение технического заголовка.

## 3. Backend-приложение

- [x] 3.1 Создать `apps/api` как минимальное NestJS-приложение с package scripts для dev, build, typecheck и test.
- [x] 3.2 Настроить запуск API на порту из `PORT` с fallback на `3001`.
- [x] 3.3 Реализовать технический `GET /health`, возвращающий `{ "status": "ok" }`, без бизнес-логики и внешних зависимостей.
- [x] 3.4 Настроить Vitest в Node environment с Nest testing utilities и добавить тест health-контроллера.

## 4. Зависимости и документация

- [x] 4.1 Установить зависимости workspace через pnpm и зафиксировать согласованный `pnpm-lock.yaml`.
- [x] 4.2 Написать README на русском языке с требованиями Node.js/pnpm, установкой, командами, адресами приложений и проверкой health endpoint.
- [x] 4.3 Проверить, что существующий `openspec/config.yaml` сохранён и OpenSpec остаётся корректно инициализированным без повторного `openspec init`.

## 5. Проверка результата

- [x] 5.1 Из корня успешно выполнить `pnpm lint` и `pnpm typecheck`, устранив все ошибки.
- [x] 5.2 Из корня успешно выполнить `pnpm test` и убедиться, что тесты web и api запускаются через Vitest.
- [x] 5.3 Из корня успешно выполнить `pnpm build` и убедиться, что оба приложения собираются.
- [x] 5.4 Запустить `pnpm dev`, проверить web на `http://localhost:3000` и ответ API на `http://localhost:3001/health`.

## 6. Централизация общих зависимостей

- [x] 6.1 Добавить pnpm catalog для `typescript`, `vitest` и `@types/node`, перевести оба приложения на протокол `catalog:` и обновить lockfile.
- [x] 6.2 Проверить frozen install, lint, typecheck, тесты, сборку и строгую валидацию OpenSpec после миграции.

## 7. Инструкции для coding agents

- [x] 7.1 Создать корневой англоязычный `AGENTS.md` с общей структурой, командами, workspace-политикой, архитектурными правилами и OpenSpec workflow.
- [x] 7.2 Создать `apps/web/AGENTS.md` с дополнительными правилами Next.js App Router, Feature Sliced Design и Vitest/React Testing Library.
- [x] 7.3 Создать `apps/api/AGENTS.md` с дополнительными правилами NestJS, слоистой архитектуры и Vitest/Nest testing utilities.
- [x] 7.4 Проверить иерархию инструкций, выполнить lint, typecheck, тесты, сборку и строгую валидацию OpenSpec.
