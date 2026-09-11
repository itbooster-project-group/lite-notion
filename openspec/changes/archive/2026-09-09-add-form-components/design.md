## Context

Мотивация описана в proposal.md. Проект использует shadcn `base-mira` и `@base-ui/react`; alias генерации указывает на `src/shared/ui/shadcn`. Input уже обёрнут, Button экспортируется напрямую и импортирует проектный Tooltip из generated-слоя. В продукте используются render-композиция Button, React Hook Form и нативные label/select/checkbox. Существующие controls-тесты проверяют преимущественно классы.

## Goals / Non-Goals

**Goals:** изолировать шесть form-компонентов от библиотечной реализации, обеспечить проверяемый контракт четырёх режимов Select и обратную совместимость Button/Input.

**Non-Goals:** универсальный FormField, новая валидация, изменение бизнес-логики и массовая замена нативных полей. Существующие прямые реэкспорты Dialog/Drawer/Menu не расширяются и не перерабатываются этим change.

## Decisions

### 1. Два слоя и публичный API

Библиотечные компоненты получаем из shadcn Base UI согласно существующему components.json и размещаем только в `shared/ui/shadcn`. Наши button/input/label/textarea/checkbox/select лежат уровнем выше и используют этот слой. Прямые импорты Base UI в новых проектных обёртках не нужны; необходимая библиотечная композиция остаётся в shadcn. Для Label/Textarea используется реализация соответствующего shadcn-компонента, даже если она основана на семантическом HTML и не требует отдельного Base UI primitive.

Button Tooltip и loading принадлежат проектной обёртке; генерация не должна стирать проектное поведение. Сохраняем текущие библиотечные размеры и styles вместо массовой регенерации существующих файлов. Альтернатива — дорабатывать generated-компоненты — нарушает согласованную границу.

Index экспортирует шесть обёрток, ButtonProps, InputProps, LabelProps, TextareaProps, CheckboxProps, SelectProps, SelectOption и SelectSingleProps/SelectMultipleProps. Не экспортируем внутренние compound-примитивы или variant builders. Публичные типы разрешено выводить из библиотечных props внутри обёртки, но потребителю не нужны внутренние пути.

Проверка импортов в web Vitest на TypeScript AST разрешает внешним потребителям только корневой UI API, проверяя alias и относительные пути; внутри UI разрешает локальную композицию, но запрещает shadcn → проектные обёртки. Проверяет отсутствие прямых реэкспортов шести form-компонентов из shadcn. Остальные существующие overlay-экспорты остаются вне этого правила.

### 2. Размеры и состояния

Button сохраняет variants default/outline/secondary/ghost/destructive/link и размеры default/xs/sm/lg/icon/icon-xs/icon-sm/icon-lg. Для Input, Textarea и Select используем `controlSize: 'sm' | 'default' | 'lg'`, default по умолчанию: это не конфликтует с нативным числовым size у Input. Однострочные высоты — h-6/h-7/h-8; Textarea использует соответствующие отступы, rows и вертикальный resize. Label и Checkbox имеют один default-размер. Поля имеют один визуальный variant; error не является отдельным variant.

Ошибка задаётся стандартным aria-invalid, описание — aria-describedby; отдельный error prop не вводим. Не перезаписываем переданные id, aria-атрибуты, ref или обработчики. Loading применим к Button; Input/Textarea/Checkbox/Label не получают искусственные loading/empty props. Select работает с локальными options, поэтому загрузка данных не входит в его MVP-контракт.

Loading Button показывает декоративный LoaderCircle из lucide, сохраняет children и aria-label, выставляет aria-busy и блокирует activation/submit/navigation. Для loading используем доступное неактивное состояние с сохранением фокуса; disabled имеет приоритет и сохраняет прежнее поведение. Блокировку проверяем и для render ссылки, и для композиции с dialog/menu triggers. Tooltip не показывается при disabled/loading. Альтернатива — только disabled — не обеспечивает требование сохранения фокуса при загрузке.

### 3. Единый Select поверх shadcn Select и Combobox

Публичный Select принимает `options: readonly SelectOption[]`, где option содержит уникальный `value: string`, `label: string`, необязательный `disabled`. Используем shadcn Select для searchable=false и shadcn Combobox для searchable=true; multiple передаётся соответствующей библиотечной реализации. Обе ветви спрятаны в нашей обёртке и имеют единый API. Самостоятельная реализация listbox/popover и нативный select с отдельным поиском отклонены: они добавляют собственное управление доступностью.

Перед добавлением библиотечных файлов проверяем API установленной версии и shadcn-реализации для обеих ветвей; изменение выбранного подхода требует согласования artifacts до продолжения. Новые зависимости не запланированы: используем имеющиеся Base UI, shadcn, cva и lucide.

Props образуют discriminated union: multiple?:false связывает value/defaultValue/onValueChange с string|null; multiple:true — с string[]. Controlled и uncontrolled ветви не принимают value и defaultValue одновременно. Значения options уникальны, multiple не допускает дублей. Передача неизвестного value считается ошибкой потребителя; изменение списка не должно молча сбрасывать значение или вызывать onValueChange. Для временно отсутствующего выбранного option отображаем его value как fallback.

Searchable=false и multiple=false по умолчанию. Общие props: controlSize, disabled, name, id, ref на триггер, onBlur, aria-label/labelledby/describedby/invalid, placeholder, clearable=false. Очистка — отдельная доступная кнопка, не вложенная в button-триггер. В multiple показываем два названия и «+N»; полное перечисление доступно через связанное описание, не заменяющее label поля.

Поиск — локальное вхождение по label без учёта регистра; запрос сбрасывается при открытии и не меняет выбранные значения. Сообщения empty и no-results не являются option. Одиночный выбор закрывает popup и возвращает фокус; multiple сохраняет popup. Search input получает имя «Поиск вариантов» и фокус при открытии. Библиотека владеет стрелками, active option, Escape, portal и взаимодействием с dialog focus trap; обёртка не дублирует собственный keyboard engine.

### 4. Формы и доступность

Input/Textarea сохраняют нативные props/ref для register. Checkbox предлагает checked/defaultChecked, onCheckedChange(boolean), отдельный indeterminate, name/value; Select — value/defaultValue и onValueChange. Checkbox/Select интегрируются с React Hook Form через Controller, без зависимости UI от RHF. Именованные Select сериализуют single одним значением, multiple повторяющимися именами; пустой выбор не добавляет значений, disabled не участвует в FormData. Uncontrolled reset восстанавливает defaults; controlled reset выполняет потребитель. Используем библиотечную поддержку формы, не создавая дублирующие hidden inputs.

Label сохраняет htmlFor. Disabled и aria-invalid передаются семантическому контролу, а не только контейнеру. При Select внутри Dialog Escape закрывает верхний popup, Tab не запирает пользователя. Не изменяем API, БД или realtime; проверка прав остаётся в продукте и backend, disabled не является защитой доступа.

### 5. Проверки

Co-located Vitest/RTL-тесты импортируют контролы через публичный API, используют роли/имена и явный cleanup. Проверяем loading, icon Tooltip, render, ref/обработчики, Label, error descriptions, Checkbox, FormData/reset, четыре комбинации Select, disabled options, очистку, поиск, пустые состояния и focus внутри Dialog. Для публичного discriminated union добавляем положительные и отрицательные typecheck fixtures. Проверки импортов покрываем разрешёнными и запрещёнными fixtures, включая относительный обход alias.

Используем существующие RTL fireEvent/act, детерминированные данные и ограниченные waitFor для observable transitions; без сети, произвольных sleep и snapshot всей разметки. jsdom не подтверждает визуальный focus ring, clipping и реальное поведение screen reader: дополнительно проводим браузерную клавиатурную проверку четырёх режимов, в том числе в Dialog, и визуальную проверку размеров/ошибок. Не создаём постоянный демонстрационный маршрут.

## Risks / Trade-offs

- Две библиотечные ветви Select могут расходиться по формам и фокусу → одинаковые параметризованные контрактные тесты.
- Loading может конфликтовать с render и внешними triggers → интеграционные тесты блокировки, сохранения ref и фокуса.
- Обновление shadcn может затронуть существующие стили → добавлять только необходимые файлы, проверять diff и сохранять defaults.
- Проверка архитектуры может захватить legacy overlays → ограничить запрет реэкспортов шестью form-компонентами, сохранив общий запрет глубоких продуктовых импортов.

## Migration Plan

В одной ветке добавить библиотечный слой и обёртки, переключить экспорт Button, обновить контролы и тесты. Продуктовые формы автоматически получают совместимые Button/Input; миграция label/select/checkbox не обязательна. До завершения выполнить OpenSpec strict, lint, web typecheck/test/build и ручную проверку. Если меняются зависимости или root-конфигурация — полный root-набор проверок. Откат — revert изменения UIKit и его artifacts; миграции данных не требуются.
