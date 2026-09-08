## Context

См. `proposal.md` для мотивации. Сейчас `apps/web` уже использует `lucide-react`, но часть UI импортирует Hugeicons напрямую, а shadcn-конфигурация указывает `iconLibrary: "hugeicons"`. Изменение затрагивает только frontend и workspace-зависимости.

## Goals / Non-Goals

**Goals:**

- Использовать только `lucide-react` для UI-иконок в `apps/web`.
- Удалить runtime-зависимости Hugeicons из web-приложения и lockfile.
- Сохранить существующие размеры, accessible names, disabled/pending states и обработчики взаимодействий.
- Закрепить проектную конвенцию в `apps/web/AGENTS.md`.

**Non-Goals:**

- Не менять продуктовые сценарии, API, backend, realtime-события или модель данных.
- Не менять shadcn style, Tailwind-тему или визуальную систему за пределами источника иконок.
- Не добавлять новые библиотеки и не создавать wrapper-абстракцию для иконок.

## Decisions

1. Использовать прямые импорты из `lucide-react`.
   - Rationale: проект уже импортирует Lucide напрямую, а дополнительный wrapper не уменьшит сложность для малого набора иконок.
   - Alternative considered: общий `Icon` wrapper. Отклонён, потому что добавил бы новый слой без повторяющейся логики.

2. Сопоставить Hugeicons с ближайшими Lucide-аналогами:
   - `PlusSignIcon` -> `Plus`
   - `Cancel01Icon` -> `X`
   - `SidebarLeftIcon` -> `PanelLeft`
   - `Logout01Icon` -> `LogOut`
   - `ArrowRight01Icon` -> `ChevronRight`
   - `Tick02Icon` -> `Check`
   - текстовые `▸`/`▾` -> `ChevronRight`/`ChevronDown`
   - текстовые drag handles `⋮⋮` -> `GripVertical`

3. Оставить размеры иконок под управлением существующих классов кнопок и локальных классов.
   - Rationale: `Button` уже задаёт стабильные размеры для вложенных `svg`, а деревья используют фиксированные `size-7` controls.
   - Alternative considered: задавать `size` prop везде. Отклонён, чтобы не расходиться с локальным shadcn-паттерном.

4. Переключить `components.json` на `iconLibrary: "lucide"` без регенерации shadcn-компонентов.
   - Rationale: generated/shared primitives уже находятся в репозитории; нужна конфигурационная конвенция для будущих добавлений.

## Risks / Trade-offs

- [Risk] Lucide-аналоги могут немного отличаться по геометрии от Hugeicons. -> Mitigation: сохранить размеры контейнеров и проверить UI-тестами/визуальным запуском, чтобы не сломать layout.
- [Risk] SVG внутри tree controls может перехватить click target или изменить bubbling. -> Mitigation: использовать `aria-hidden` и `pointer-events-none` для декоративных иконок, сохранив текущие handlers на кнопках.
- [Risk] Lockfile может остаться с транзитивными Hugeicons-записями. -> Mitigation: обновить lockfile через pnpm и отдельно проверить отсутствие `@hugeicons` поиском по source/config/lock.

## Migration Plan

1. Заменить Hugeicons и текстовые псевдоиконки на Lucide в затронутых компонентах.
2. Обновить shadcn-конфигурацию и frontend AGENTS-конвенцию.
3. Удалить Hugeicons из `apps/web/package.json` и обновить `pnpm-lock.yaml`.
4. Запустить OpenSpec validation и полный набор root-проверок для dependency/config change.

Rollback: вернуть зависимости Hugeicons и соответствующие импорты из git diff, затем восстановить lockfile через pnpm.
