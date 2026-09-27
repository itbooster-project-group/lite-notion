## 1. Перестановка на одном уровне

- [x] 1.1 Включить `canReorder: true` в `WorkspaceTree` и `PageTree`
- [x] 1.2 Заменить `childCount` на `childPageIds` в `PageDropTarget` типа `item`; `toMoveIntent` считает индекс «в конец родителя» без перемещаемой страницы
- [x] 1.3 Регрессионные тесты `toMoveIntent`: drop в конец текущего родителя не выходит за границу siblings; drop в конец другого родителя добавляет страницу последней
- [x] 1.4 В `toWorkspaceDropTarget` трактовать неупорядоченную цель-проект как корень проекта (`parentPageId: null`)

## 2. Линия вставки

- [x] 2.1 Добавить `TreeDropIndicator` в `apps/web/src/shared/ui`, принимающий `CSSProperties` из `tree.getDragLineStyle()`
- [x] 2.2 Unit-тест компонента: скрыт вне активного перетаскивания, позиционирован во время перетаскивания
- [x] 2.3 Рендерить индикатор в `WorkspaceTree` внутри контейнера дерева с `position: relative`
- [x] 2.4 Рендерить тот же индикатор в `PageTree`

## 3. Проверка

- [x] 3.1 Существующие тесты деревьев, диалога «Переместить…» и клавиатурного DnD проходят без изменений
- [x] 3.2 `pnpm --filter @lite-notion/web typecheck`, тесты затронутых модулей, `biome check` изменённых файлов
- [x] 3.3 Ручная проверка в приложении: линия и перестановка на одном уровне в боковой панели и в `/projects/{projectId}`
- [x] 3.4 `openspec validate add-dnd-drop-indicators --strict`
