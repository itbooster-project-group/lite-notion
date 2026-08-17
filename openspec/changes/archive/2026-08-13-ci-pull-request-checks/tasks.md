## 1. Workflow: базовая структура

- [x] 1.1 Создать `.github/workflows/ci.yml` с триггером `pull_request` (`opened`, `synchronize`, `reopened`) на `branches: [main]`.
- [x] 1.2 Добавить `concurrency` с `group: ci-${{ github.workflow }}-${{ github.event.pull_request.number }}` и `cancel-in-progress: true`.
- [x] 1.3 Вынести общий шаблон установки (`pnpm/action-setup@v4` с версией `11.21.0`, `actions/setup-node@v4` с Node 22 и `cache: pnpm`, `pnpm install --frozen-lockfile`) в каждый джоб.

## 2. Джоб `lint`

- [x] 2.1 Добавить джоб `lint`, выполняющий `pnpm lint` (Biome) для всего workspace.

## 3. Джоб `web`

- [x] 3.1 Добавить джоб `web`, выполняющий последовательно `pnpm --filter @lite-notion/web run typecheck`, `run test`, `run build`.

## 4. Джоб `api`

- [x] 4.1 Добавить джоб `api`, выполняющий последовательно `pnpm --filter @lite-notion/api run typecheck`, `run test`, `run build`.

## 5. Проверка workflow

- [x] 5.1 Открыть тестовый PR из ветки `infra/ci-pull-request-checks` и убедиться, что джобы `lint`, `web`, `api` запускаются автоматически. Проверено на PR #6.
- [x] 5.2 Добавить новый коммит в PR и убедиться, что предыдущий запуск CI отменяется, а новый стартует. Подтверждено прогонами на коммитах `8528329` (cancelled) → `f29e048` (success).
- [x] 5.3 Временно внести ошибку lint/typecheck/test/build в тестовой ветке и убедиться, что соответствующий джоб падает и помечается как failed. Подтверждено прогонами на коммитах `ff002f0` и `0b6e7bb` (failure).
- [x] 5.4 Убедиться, что при исправлении ошибки все три джоба проходят и помечаются как passed. Подтверждено прогонами на коммитах `60c9f6b`, `d19db2f`, `4cace3c` (success).

## 6. Branch protection на `main`

- [x] 6.1 Включить защиту `main` через GitHub Repository Rulesets (`gh api repos/.../rulesets`): обязательный PR перед merge с ≥1 approval, `required_status_checks` = `lint`, `web`, `api` (`strict_required_status_checks_policy: true`), запрет force-push (`non_fast_forward`) и удаления ветки (`deletion`), без bypass. Настроено напрямую через ruleset вместо legacy branch protection API — эквивалентный результат, подтверждено через `gh api repos/.../rulesets/20681395`.
- [x] 6.2 Убедиться, что прямой `git push` в `main` отклоняется GitHub. Подтверждено: прямой push отклонён с `GH013` ("Changes must be made through a pull request", "3 of 3 required status checks are expected").
- [ ] 6.3 Убедиться, что PR с failed или pending обязательным чеком не даёт кнопку merge на GitHub. Не проверено под текущим ruleset: все тестовые failed-прогоны (5.3) прошли до включения `required_status_checks` в ruleset — проверим на следующем PR.

## 7. Документация

- [x] 7.1 Обновить `AGENTS.md` кратким упоминанием, что PR проходят обязательный CI (`lint`, `web`, `api`) и прямой push в `main` запрещён.

## 8. Финализация OpenSpec

- [x] 8.1 Отметить все выполненные задачи в этом файле.
- [x] 8.2 Выполнить `openspec validate 2026-08-13-ci-pull-request-checks --strict`.
- [x] 8.3 Получить human review proposal, design и tasks до реализации; после реализации — review итогового PR. PR #6 approved ревьюером VAnastasia.
- [x] 8.4 Заархивировать change в том же PR, где реализован CI.
