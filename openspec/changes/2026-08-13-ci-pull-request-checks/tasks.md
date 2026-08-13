## 1. Workflow: базовая структура

- [ ] 1.1 Создать `.github/workflows/ci.yml` с триггером `pull_request` (`opened`, `synchronize`, `reopened`) на `branches: [main]`.
- [ ] 1.2 Добавить `concurrency` с `group: ci-${{ github.workflow }}-${{ github.event.pull_request.number }}` и `cancel-in-progress: true`.
- [ ] 1.3 Вынести общий шаблон установки (`corepack enable`, `pnpm/action-setup@v4` с версией `11.21.0`, `actions/setup-node@v4` с Node 22 и `cache: pnpm`, `pnpm install --frozen-lockfile`) в каждый джоб.

## 2. Джоб `lint`

- [ ] 2.1 Добавить джоб `lint`, выполняющий `pnpm lint` для всего workspace.

## 3. Джоб `web`

- [ ] 3.1 Добавить джоб `web`, выполняющий последовательно `pnpm --filter @lite-notion/web run typecheck`, `run test`, `run build`.

## 4. Джоб `api`

- [ ] 4.1 Добавить джоб `api`, выполняющий последовательно `pnpm --filter @lite-notion/api run typecheck`, `run test`, `run build`.

## 5. Проверка workflow

- [ ] 5.1 Открыть тестовый PR из ветки `infra/ci-pull-request-checks` и убедиться, что джобы `lint`, `web`, `api` запускаются автоматически.
- [ ] 5.2 Добавить новый коммит в PR и убедиться, что предыдущий запуск CI отменяется, а новый стартует.
- [ ] 5.3 Временно внести ошибку lint/typecheck/test/build в тестовой ветке и убедиться, что соответствующий джоб падает и помечается как failed.
- [ ] 5.4 Убедиться, что при исправлении ошибки все три джоба проходят и помечаются как passed.

## 6. Branch protection на `main`

- [ ] 6.1 После первого успешного прогона `ci.yml` на `main` включить branch protection через `gh api repos/itbooster-project-group/lite-notion/branches/main/protection` (или Settings → Branches): обязательный PR перед merge, `required_status_checks.contexts = ["lint", "web", "api"]`, `strict: true`, `enforce_admins: true`, запрет force-push и удаления ветки.
- [ ] 6.2 Убедиться, что прямой `git push` в `main` отклоняется GitHub.
- [ ] 6.3 Убедиться, что PR с failed или pending обязательным чеком не даёт кнопку merge на GitHub.

## 7. Документация

- [ ] 7.1 Обновить `AGENTS.md` (при необходимости) кратким упоминанием, что PR проходят обязательный CI (`lint`, `web`, `api`) и прямой push в `main` запрещён.

## 8. Финализация OpenSpec

- [ ] 8.1 Отметить все выполненные задачи в этом файле.
- [ ] 8.2 Выполнить `openspec validate 2026-08-13-ci-pull-request-checks --strict`.
- [ ] 8.3 Получить human review proposal, design и tasks до реализации; после реализации — review итогового PR.
- [ ] 8.4 Заархивировать change в том же PR, где реализован CI.
