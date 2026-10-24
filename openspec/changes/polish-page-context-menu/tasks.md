## 1. Меню действий страницы

- [x] 1.1 Добавить небольшой `PageActionMenuItem` в `entities/page` для общей строки с иконкой, подписью, callback и destructive-вариантом; экспортировать через public API и использовать в `PageAccessMenuItem`.
- [x] 1.2 Обновить page action menus в `WorkspaceTreeItem` и `PageTreeItem`: единые иконки, порядок sidebar actions, separator перед delete только при доступном delete и предшествующем действии, одинаковая локальная ширина popup около 224 px с ограничением viewport и размеры.
- [x] 1.3 Переэкспортировать существующий dropdown separator через `shared/ui`; не менять shared стили пунктов и другие меню.
- [x] 1.4 Подключить `PageTreeItem` к существующему `PageAccessPanel` через callback выбранного page ID и controlled state в `WorkspaceMain`, сохранив capability check.
- [x] 1.5 Оформить «Удалить проект» в проектном меню `WorkspaceTreeItem` через `PageActionMenuItem` и ту же ширину popup, что у page menu.

## 2. Поведение и проверки

- [x] 2.1 Обновить существующие тесты обоих деревьев: общий набор доступных owner actions, callback открытия доступа для выбранной страницы, удаление проекта, keyboard/focus и отсутствие навигации; сохранить проверки permissions.
- [ ] 2.2 Проверить существующие тесты соседних меню и browser-поведение page/project menus на desktop/mobile, у краёв viewport и в светлой/тёмной темах.
- [x] 2.3 Запустить web typecheck, repository lint, релевантные тесты и `openspec validate polish-page-context-menu --strict`.
