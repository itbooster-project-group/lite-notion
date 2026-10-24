## Context

См. `proposal.md` — Why. Меню действий страниц независимо формируют `WorkspaceTreeItem` в `widgets/workspace-navigation` и `PageTreeItem` в `features/workspace-management`; оба используют primitives из `shared/ui`, но отличаются условиями доступности, callbacks и управлением фокусом. В `shared/ui/shadcn/dropdown-menu.tsx` popup по умолчанию получает ширину `--anchor-width`, а пункт меню — `text-xs` и `min-h-7`; узкий popup переносит подписи и увеличивает высоту меню. Separator primitive уже существует, но фасад `shared/ui` его не экспортирует.

## Goals / Non-Goals

**Goals:**

- Обеспечить одинаковое визуальное оформление меню страниц в сайдбаре и дереве проекта.
- Вынести повторяющуюся презентацию одной строки действия в небольшой page-specific компонент, сохранив списки действий и их поведение в местах использования.
- Подключить доступ к существующей панели из обоих деревьев, сохранив capability checks, возврат фокуса, клавиатурное управление и mobile drawer.

**Non-Goals:**

- Менять другие dropdown, модель прав доступа или бизнес-логику.
- Создавать bottom sheet, новые UI primitives, дизайн-токены, зависимости или дополнительные абстракции.

## Decisions

- Оставить формирование списка, permission checks, callbacks и работу с фокусом в каждом из двух tree-компонентов. Разделить только повторяющуюся строку пункта: создать `PageActionMenuItem` в `entities/page/ui`, экспортировать через public API сущности и использовать в обоих деревьях и `PageAccessMenuItem`. Компонент принимает иконку, подпись, callback выбора и destructive-вариант; он не решает, какие действия доступны.
- Передать `onOpenPageAccess(pageId)` из `WorkspaceMain` в `PageTree` и `PageTreeItem`. `WorkspaceMain` хранит ID выбранной строки и открывает существующий `PageAccessPanel` в controlled-режиме для соответствующей normalized page. Видимость пункта остаётся под `capabilities.canManageAccess`; панель активной страницы продолжает открываться текущим способом.
- В обоих `MenuPopup` локально переопределить ширину, установленную базовым primitive от кнопки-триггера: использовать ширину 224 px с ограничением viewport. Сохранить portal, позиционирование и `sideOffset`, чтобы popup не обрезался у краёв.
- В общей строке задать одинаковую типографику 14 px, подписи в одну строку, gap/padding и иконки 16 px; минимальная высота — 36 px на desktop и 44 px на mobile. Не менять базовые стили shared `MenuItem` и другие меню.
- Использовать `FilePlus2`, `Pencil`, `FolderInput`, `ShieldCheck` и `Trash2` из установленного `lucide-react`; пометить иконки декоративными. Удаление страницы и проекта оформить существующим destructive variant через `PageActionMenuItem`. В обоих page menus порядок: создать, переименовать, переместить, доступ, separator, удалить. В project-only menu оставить единственное действие «Удалить проект» без separator.
- Переэкспортировать существующий `DropdownMenuSeparator` как `MenuSeparator` в `shared/ui/index.ts`. Обновить существующие `workspace-tree.spec.tsx` и `page-tree.spec.tsx` по поведению; существующие проверки callbacks, permissions и focus оставить значимыми.

## Risks / Trade-offs

- Общая строка может размыть различия между меню → передавать в неё только представление пункта, оставив каждое условие, callback и focus transition в исходном компоненте.
- Панель доступа относится к выбранной строке, а не только к активной странице → открывать существующий controlled `PageAccessPanel` по page ID и не менять API или permissions.
- Базовая ширина popup привязана к trigger → переопределять её только на page menu и проверить viewport-edge positioning; остальные меню останутся без изменений.
- Размеры touch-target изменятся только на пунктах двух page menus → проверить desktop и mobile, включая отсутствие скролла и обрезания.
