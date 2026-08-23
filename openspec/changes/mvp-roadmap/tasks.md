## 1. Новый GitHub backlog

- [x] 1.1 Проверить авторизацию GitHub write-инструмента и отсутствие новых issues с совпадающими schema-driven заголовками.
- [x] 1.2 Создать meta issue для актуализации MVP roadmap и сохранить её URL для нового PR.
- [x] 1.3 Создать новые issues этапов identity и pages, указав PR #37 и фактические зависимости.
- [x] 1.4 Создать новые issues этапов permissions и collaboration, связав их с pages и PR #37.
- [x] 1.5 Создать новые issues этапов assets и history, связав их с collaboration foundation.
- [x] 1.6 Создать новые issues этапов search и publication, связав их с permissions, collaboration, assets и history.
- [x] 1.7 Проверить, что создано ровно 16 новых issues, их тела соответствуют design, а старые issues и PR #22 не изменены.

## 2. MVP roadmap и навигация документации

- [x] 2.1 Перенести итоговые MVP-документы и screen assets из `origin/docs/mvp-plan`, не перенося устаревший README.
- [x] 2.2 Переписать `docs/mvp-plan.md` под девять schema-driven этапов, фактические URL новых issues и активный PR #37.
- [x] 2.3 Зафиксировать зависимости и параллельные ветви roadmap, а также исключение самостоятельных задач и прочих deferred entities.
- [x] 2.4 Обновить актуальный README ссылками на MVP roadmap, схемы экранов, схему БД и OpenSpec workflow.

## 3. Схемы экранов и генератор

- [x] 3.1 Переписать `docs/mvp-screens.md` под девять этапных макетов и согласованные текстовые схемы.
- [x] 3.2 Обновить `docs/screens/generate.js` до ESM, девяти макетов и запуска Chrome через channel или `PUPPETEER_EXECUTABLE_PATH`.
- [x] 3.3 Добавить root-команду `docs:screens`, direct devDependency `puppeteer-core` и обновить `pnpm-lock.yaml` через pnpm.
- [x] 3.4 Удалить task-specific PNG, сгенерировать девять новых PNG и проверить их размеры и содержание.

## 4. Проверки и доставка

- [x] 4.1 Проверить внутренние Markdown-ссылки, URL всех новых issues, отсутствие task-specific roadmap/screens и выполнить `git diff --check`.
- [x] 4.2 Выполнить `openspec validate mvp-roadmap --strict` и проверить состояние change.
- [ ] 4.3 Выполнить `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` и `pnpm steiger`.
- [x] 4.4 Проверить итоговый diff на отсутствие runtime-кода, миграций и незаявленных изменений.
- [ ] 4.5 Отправить ветку `docs/plan` и открыть новый PR, закрывающий только новую meta issue и ссылающийся на PR #22 как источник материалов.
