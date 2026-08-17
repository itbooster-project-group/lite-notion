## Why

Сейчас в репозитории нет автоматических проверок Pull Request и нет защиты ветки `main`: возможен прямой push в `main`, а PR можно смержить независимо от того, проходят ли `lint`, `typecheck`, `test` и `build`. Issue [#3](https://github.com/itbooster-project-group/lite-notion/issues/3) требует обязательный CI, который блокирует merge при непройденных проверках и запрещает прямой push в защищённые ветки.

## What Changes

- Добавить workflow GitHub Actions `.github/workflows/ci.yml`, запускающийся на `pull_request` (`opened`, `synchronize`, `reopened`) с целевой веткой `main`.
- Настроить `concurrency`, отменяющий устаревший запуск CI при появлении нового коммита в том же PR.
- Добавить джоб `lint`, выполняющий `pnpm lint` (Biome) один раз для всего workspace.
- Добавить джоб `web`, выполняющий `typecheck`, `test` и `build` для `@lite-notion/web`.
- Добавить джоб `api`, выполняющий `typecheck`, `test` и `build` для `@lite-notion/api`.
- Настроить `branch protection` для `main` через GitHub API: обязательный PR перед merge, обязательные статус-чеки `lint`, `web`, `api`, запрет прямого push, запрет force-push.
- Не включать в это изменение: деплой, сборку и публикацию Docker-образов, e2e-тесты, пороги покрытия тестами, дополнительные линтеры сверх Biome — они оформляются отдельными изменениями при необходимости.

## Capabilities

### New Capabilities

Нет. Изменение добавляет только процесс проверки и защиту ветки, не затрагивая наблюдаемое продуктовое поведение приложений.

### Modified Capabilities

Нет.

## Impact

- **Инфраструктура разработки:** появится `.github/workflows/ci.yml`; на `main` будет включена защита ветки в настройках GitHub-репозитория.
- **Frontend/Backend:** код приложений не меняется, CI использует уже существующие корневые и app-level scripts (`lint`, `typecheck`, `test`, `build`).
- **Рабочий процесс:** прямой push в `main` станет невозможен; merge PR будет заблокирован при падении любого обязательного чека.
- **Публичные API и данные:** не затрагиваются.
