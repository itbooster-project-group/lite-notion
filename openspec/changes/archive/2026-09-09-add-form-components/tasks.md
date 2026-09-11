## 1. Библиотечный слой

- [x] 1.1 Проверить shadcn Base UI Select/Combobox установленной версии: multiple, searchable-композицию, ref, формы/reset и disabled; подтвердить подход design без новых зависимостей.
- [x] 1.2 Добавить необходимые библиотечные Label, Textarea, Checkbox, Select, Combobox и их shadcn-зависимости в `src/shared/ui/shadcn` по components.json; проверить отсутствие проектного поведения и незапланированных изменений существующих primitives.

## 2. Button и текстовые поля

- [x] 2.1 Создать проектную обёртку Button, перенести Tooltip из shadcn, переключить публичный экспорт; сохранить variants, размеры и render/ref-композицию.
- [x] 2.2 Добавить loading Button с индикатором, aria-busy, сохранением имени/фокуса и блокировкой action/submit/navigation, включая render и dialog/menu triggers.
- [x] 2.3 Добавить RTL-регрессии Button через публичный API: loading, disabled, фокус, Tooltip, render ссылки и композиция с triggers.
- [x] 2.4 Доработать Input и добавить Label/Textarea поверх shadcn: controlSize, rows, disabled, aria-invalid/describedby, нативные props/ref и существующие defaults.
- [x] 2.5 Проверить Label-связи, изменение текстовых значений, ref/blur/change, error description и совместимость Input с RHF; сохранить необходимые проверки размеров.

## 3. Checkbox

- [x] 3.1 Добавить обёртку Checkbox и публичный CheckboxProps: checked/defaultChecked, onCheckedChange, indeterminate, disabled, error, ref и name/value.
- [x] 3.2 Добавить детерминированные RTL-тесты подписи, Space, смешанного состояния, controlled/uncontrolled, disabled и формы/reset.

## 4. Select

- [x] 4.1 Определить и экспортировать SelectOption, SelectSingleProps, SelectMultipleProps и SelectProps с discriminated union для multiple и взаимоисключением value/defaultValue; добавить положительные/отрицательные typecheck fixtures.
- [x] 4.2 Реализовать single/multiple без поиска через shadcn Select: controlled/uncontrolled, disabled-варианты, controlSize, placeholder, отображение выбора и clearable.
- [x] 4.3 Реализовать searchable single/multiple через shadcn Combobox: локальную фильтрацию, сброс запроса, сохранение выбранного и отдельные empty/no-results сообщения.
- [x] 4.4 Реализовать общий доступный контракт Select: label/id/ref, error description, клавиатуру/фокус, форму/name/reset и RHF Controller без зависимости UI от RHF.
- [x] 4.5 Добавить параметризованные RTL-тесты четырёх режимов: выбор/повторный выбор, callbacks, disabled, очистку, отображение нескольких значений, фильтрацию, пустые состояния и повторное открытие.
- [x] 4.6 Добавить тесты Select внутри Dialog: открытие, стрелки/Enter, Escape без закрытия диалога, возврат фокуса и Tab; проверить FormData/reset и controlled-обновления.

## 5. Публичные границы

- [x] 5.1 Проверить экспорты шести обёрток и всех публичных типов в `src/shared/ui/index.ts`; убрать прямые form-реэкспорты generated-модулей, сохранив legacy overlay API.
- [x] 5.2 Добавить web-проверку импортов на TypeScript AST для alias/относительных путей и реэкспортов: продукт → публичный UI API, shadcn без зависимости от проектных обёрток; покрыть разрешённые и запрещённые fixtures.
- [x] 5.3 Выполнить регрессионные тесты текущих потребителей Button/Input и проверить отсутствие необходимости массовой миграции продуктовых форм.

## 6. Итоговая проверка

- [x] 6.1 Выполнить браузерную клавиатурную и визуальную проверку четырёх режимов Select, в том числе внутри Dialog, loading Button, размеров, focus ring и ошибок; записать результаты без постоянного demo-маршрута.
- [x] 6.2 Выполнить `openspec validate add-form-components --strict`, `pnpm lint`, web typecheck/test/build; при dependency или root-config изменениях выполнить полный root-набор lint/typecheck/test/build.
- [x] 6.3 Проверить соответствие итогового diff proposal/spec/design, отсутствие generated build output и подготовить результат реализации к human review; архивирование выполнять только после review отдельным шагом workflow.
