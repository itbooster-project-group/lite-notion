## ADDED Requirements

### Requirement: Мягкое удаление страницы из workspace UI
Workspace UI MUST позволять пользователю удалить страницу через существующее меню действий страницы. Действие MUST быть доступно во всех актуальных представлениях, где есть page action menu: в основном дереве страниц проекта и в дереве `WorkspaceNavigation`.

Перед отправкой DELETE workspace UI MUST открыть confirmation dialog. Dialog MUST явно назвать destructive действие, показать актуальный заголовок выбранной страницы и предупредить, что эта страница и все вложенные страницы будут перемещены в корзину. DELETE MUST NOT отправляться до явного подтверждения пользователем.

После успешного ответа удалённая страница и всё её поддерево MUST исчезать из обычного workspace UI без ручного refresh. Если текущий route относится к удаляемому поддереву, workspace MUST сразу начать replace-navigation с route удалённого ресурса и MUST NOT видеть промежуточное unavailable/not-found state из-за локальной синхронизации cache, даже если route transition применяется не в тот же render. Для affected delete workspace MUST использовать replace-navigation вместо push-navigation, чтобы текущая history entry удалённого active route была заменена target route; этот change не обязан очищать более старые entries browser history.

Если API отвечает ошибкой, dialog MUST оставаться открытым, ресурс MUST оставаться в UI, текущий route MUST NOT меняться, а пользователь MUST получить понятное доступное сообщение об ошибке без сырых backend details.

До подтверждения Cancel, Escape, close control и interaction outside/overlay MUST закрывать dialog согласно обычному поведению primitive без DELETE, без изменения cache и route и с возвратом focus к trigger. После начала DELETE dialog MUST NOT быть dismissable через Cancel, Escape, close control или interaction outside/overlay до завершения mutation; повторный submit MUST быть невозможен, destructive button MUST быть disabled и MUST показывать pending state. После ошибки pending state MUST сниматься, dialog MUST оставаться открытым, и пользователь MUST снова иметь возможность закрыть dialog любым обычным способом или повторить действие.

#### Scenario: Действие удаления страницы доступно в обоих деревьях
- **GIVEN** пользователь открыл workspace с деревом страниц
- **WHEN** он открывает меню действий страницы в основном дереве проекта или в `WorkspaceNavigation`
- **THEN** меню содержит действие `Удалить` с destructive presentation и доступным именем

#### Scenario: Подтверждение страницы содержит выбранный title
- **WHEN** пользователь выбирает `Удалить` для страницы `Alpha`
- **THEN** открывается dialog `Удалить страницу?`
- **AND** описание содержит `Страница «Alpha» и все вложенные страницы будут перемещены в корзину.`
- **AND** DELETE не отправляется до нажатия кнопки `Удалить`

#### Scenario: Последовательное открытие удаления страницы обновляет title
- **WHEN** пользователь открывает delete dialog для одной страницы, закрывает его, затем открывает delete dialog для другой страницы
- **THEN** confirmation text содержит заголовок второй выбранной страницы
- **AND** не содержит устаревший заголовок первой страницы

#### Scenario: Отмена удаления страницы до подтверждения
- **WHEN** пользователь закрывает dialog через `Отмена` или Escape до отправки DELETE
- **THEN** DELETE страницы не вызывается
- **AND** страница остаётся в дереве
- **AND** текущий route не меняется
- **AND** focus возвращается к trigger

#### Scenario: Pending удаления страницы блокирует случайное закрытие
- **WHEN** пользователь подтверждает удаление страницы и DELETE находится в состоянии pending
- **THEN** повторное подтверждение невозможно
- **AND** destructive button disabled и показывает `Удаляем…`
- **AND** Cancel, Escape, close control и interaction outside/overlay не закрывают dialog до завершения mutation

#### Scenario: Успешное удаление страницы обновляет workspace без reload
- **WHEN** пользователь подтверждает удаление страницы и API отвечает успешно
- **THEN** удалённая страница и все её потомки исчезают из основного дерева проекта и `WorkspaceNavigation`
- **AND** соседние страницы и страницы других проектов остаются видимыми

#### Scenario: Удаление текущей страницы сразу начинает replace-navigation на проект
- **GIVEN** пользователь находится на route текущей страницы
- **WHEN** он подтверждает удаление этой страницы и API отвечает успешно
- **THEN** workspace сразу начинает replace-navigation на root route проекта этой страницы
- **AND** текущая history entry удалённой страницы заменяется root route проекта
- **AND** push-navigation не используется
- **AND** пользователь не видит промежуточное unavailable/not-found state из-за локального удаления страницы из cache, даже если route context ещё один render остаётся прежним

#### Scenario: Удаление ancestor текущей страницы сразу начинает replace-navigation на проект
- **GIVEN** пользователь находится на дочерней странице
- **WHEN** он удаляет ancestor этой страницы и API отвечает успешно
- **THEN** workspace сразу начинает replace-navigation на root route проекта удалённого поддерева
- **AND** текущая history entry дочерней страницы заменяется root route проекта
- **AND** push-navigation не используется
- **AND** пользователь не видит промежуточное unavailable/not-found state из-за локального удаления поддерева из cache, даже если route context ещё один render остаётся прежним

#### Scenario: Удаление unrelated страницы не меняет route
- **GIVEN** пользователь находится на странице, которая не входит в удаляемое поддерево
- **WHEN** он удаляет другую страницу и API отвечает успешно
- **THEN** текущий route остаётся прежним
- **AND** удалённое поддерево исчезает из cache-backed UI без reload

#### Scenario: Navigation после удаления страницы не ждёт refetch
- **GIVEN** page tree query invalidation или refetch завершается медленно
- **WHEN** пользователь удаляет текущую страницу или её ancestor и API отвечает успешно
- **THEN** workspace начинает переход на root route проекта без ожидания завершения refetch

#### Scenario: Cache cleanup affected страницы ждёт смены route
- **GIVEN** пользователь находится на `/pages/child`
- **AND** route transition после `router.replace` применится позже следующего render
- **WHEN** пользователь удаляет `child` или его ancestor и API отвечает успешно
- **THEN** workspace не удаляет данные, необходимые старому route, из local cache, пока `/pages/child` ещё является текущим route context
- **AND** экран `Ничего не найдено` не появляется
- **AND** после смены route context на root route проекта удалённое поддерево исчезает из cache-backed UI

#### Scenario: Ошибка удаления страницы не меняет UI преждевременно
- **WHEN** пользователь подтверждает удаление страницы и API отвечает ошибкой
- **THEN** dialog остаётся открытым
- **AND** pending state снят
- **AND** пользователь может закрыть dialog или повторить действие
- **AND** страница остаётся в дереве
- **AND** текущий route не меняется
- **AND** сообщение об ошибке доступно screen reader

### Requirement: Мягкое удаление проекта из workspace UI
Workspace UI MUST позволять пользователю удалить проект destructive action `Удалить проект`. Действие MUST быть доступно как минимум из project item в `WorkspaceNavigation` и MUST быть доступно на root workspace project cards, потому что этот экран является основным списком проектов.

Перед отправкой DELETE workspace UI MUST открыть confirmation dialog. Dialog MUST явно назвать destructive действие, показать актуальное имя выбранного проекта и предупредить, что этот проект и все его страницы будут перемещены в корзину. DELETE MUST NOT отправляться до явного подтверждения пользователем.

После успешного ответа удалённый проект MUST исчезать из projects list, а все страницы этого проекта MUST исчезать из обычного page tree UI без ручного refresh. Если текущий route относится к удаляемому проекту, workspace MUST сразу начать replace-navigation с route удалённого проекта и MUST NOT видеть промежуточное unavailable/not-found state из-за локальной синхронизации cache, даже если route transition применяется не в тот же render. Для affected delete workspace MUST использовать replace-navigation вместо push-navigation, чтобы текущая history entry удалённого project/page route была заменена workspace root route; этот change не обязан очищать более старые entries browser history.

Если API отвечает ошибкой, dialog MUST оставаться открытым, проект и его страницы MUST оставаться в UI, текущий route MUST NOT меняться, а пользователь MUST получить понятное доступное сообщение об ошибке без сырых backend details.

До подтверждения Cancel, Escape, close control и interaction outside/overlay MUST закрывать dialog согласно обычному поведению primitive без DELETE, без изменения cache и route и с возвратом focus к trigger. После начала DELETE dialog MUST NOT быть dismissable через Cancel, Escape, close control или interaction outside/overlay до завершения mutation; повторный submit MUST быть невозможен, destructive button MUST быть disabled и MUST показывать pending state. После ошибки pending state MUST сниматься, dialog MUST оставаться открытым, и пользователь MUST снова иметь возможность закрыть dialog любым обычным способом или повторить действие.

#### Scenario: Действие удаления проекта доступно пользователю
- **GIVEN** пользователь открыл workspace с проектами
- **WHEN** он открывает действия project item в `WorkspaceNavigation` или действия project card на root workspace
- **THEN** UI содержит действие `Удалить проект` с destructive presentation и доступным именем

#### Scenario: Подтверждение проекта содержит выбранное имя
- **WHEN** пользователь выбирает `Удалить проект` для проекта `Project Alpha`
- **THEN** открывается dialog `Удалить проект?`
- **AND** описание содержит `Проект «Project Alpha» и все его страницы будут перемещены в корзину.`
- **AND** DELETE проекта не отправляется до нажатия кнопки `Удалить`

#### Scenario: Последовательное открытие удаления проекта обновляет имя
- **WHEN** пользователь открывает delete dialog для одного проекта, закрывает его, затем открывает delete dialog для другого проекта
- **THEN** confirmation text содержит имя второго выбранного проекта
- **AND** не содержит устаревшее имя первого проекта

#### Scenario: Отмена удаления проекта до подтверждения
- **WHEN** пользователь закрывает dialog через `Отмена` или Escape до отправки DELETE
- **THEN** DELETE проекта не вызывается
- **AND** проект остаётся в navigation и root project list
- **AND** текущий route не меняется
- **AND** focus возвращается к trigger

#### Scenario: Pending удаления проекта блокирует случайное закрытие
- **WHEN** пользователь подтверждает удаление проекта и DELETE находится в состоянии pending
- **THEN** повторное подтверждение невозможно
- **AND** destructive button disabled и показывает `Удаляем…`
- **AND** Cancel, Escape, close control и interaction outside/overlay не закрывают dialog до завершения mutation

#### Scenario: Успешное удаление проекта обновляет workspace без reload
- **WHEN** пользователь подтверждает удаление проекта и API отвечает успешно
- **THEN** удалённый проект исчезает из `WorkspaceNavigation` и root workspace project list
- **AND** страницы удалённого проекта исчезают из обычного workspace UI
- **AND** другие проекты и их страницы остаются видимыми

#### Scenario: Удаление текущего проекта сразу начинает replace-navigation на workspace root
- **GIVEN** пользователь находится на root route удаляемого проекта
- **WHEN** он подтверждает удаление проекта и API отвечает успешно
- **THEN** workspace сразу начинает replace-navigation на workspace root route
- **AND** текущая history entry удалённого project route заменяется workspace root route
- **AND** push-navigation не используется
- **AND** пользователь не видит промежуточное unavailable/not-found state из-за локального удаления проекта из cache, даже если route context ещё один render остаётся прежним

#### Scenario: Удаление проекта текущей страницы сразу начинает replace-navigation на workspace root
- **GIVEN** пользователь находится на странице удаляемого проекта
- **WHEN** он подтверждает удаление этого проекта и API отвечает успешно
- **THEN** workspace сразу начинает replace-navigation на workspace root route
- **AND** текущая history entry страницы удалённого проекта заменяется workspace root route
- **AND** push-navigation не используется
- **AND** пользователь не видит промежуточное unavailable/not-found state из-за локального удаления проекта и его страниц из cache, даже если route context ещё один render остаётся прежним

#### Scenario: Удаление другого проекта не меняет route
- **GIVEN** пользователь находится в одном проекте
- **WHEN** он удаляет другой проект и API отвечает успешно
- **THEN** текущий route остаётся прежним
- **AND** удалённый проект и его страницы исчезают из cache-backed UI без reload

#### Scenario: Navigation после удаления проекта не ждёт refetch
- **GIVEN** projects или page tree query invalidation завершается медленно
- **WHEN** пользователь удаляет текущий проект или проект текущей страницы и API отвечает успешно
- **THEN** workspace начинает переход на workspace root без ожидания завершения refetch

#### Scenario: Cache cleanup affected проекта ждёт смены route
- **GIVEN** пользователь находится на route удаляемого проекта или странице этого проекта
- **AND** route transition после `router.replace` применится позже следующего render
- **WHEN** пользователь удаляет проект и API отвечает успешно
- **THEN** workspace не удаляет данные проекта, необходимые старому route, из local cache, пока старый route context ещё активен
- **AND** экран `Ничего не найдено` не появляется
- **AND** после смены route context на workspace root удалённый проект и его страницы исчезают из cache-backed UI

#### Scenario: Ошибка удаления проекта не меняет UI преждевременно
- **WHEN** пользователь подтверждает удаление проекта и API отвечает ошибкой
- **THEN** dialog остаётся открытым
- **AND** pending state снят
- **AND** пользователь может закрыть dialog или повторить действие
- **AND** проект и его страницы остаются в UI
- **AND** текущий route не меняется
- **AND** сообщение об ошибке доступно screen reader

### Requirement: Доступность destructive delete controls
Delete controls in workspace UI MUST remain keyboard-accessible and MUST use semantic buttons, menu items and dialogs rather than clickable non-interactive elements. Icon-only controls MUST have clear accessible names, and decorative icons MUST be hidden from assistive technology.

Confirmation dialogs MUST manage focus according to the existing dialog primitive behavior before confirmation and after error. Destructive confirmation buttons MUST have destructive presentation, be disabled while pending and keep a clear accessible name. While DELETE is pending, confirmation dialogs MUST NOT be dismissable through Cancel, Escape, close control or interaction outside/overlay. Error messages inside dialogs MUST be announced to assistive technology.

New icon-only controls MUST use the current project icon convention based on `lucide-react`. Visible destructive menu items MUST keep textual action names and MUST NOT rely on icon-only text replacement for destructive decisions.

#### Scenario: Keyboard-accessible delete flow before confirmation
- **WHEN** пользователь открывает action menu клавиатурой, выбирает destructive delete action, затем закрывает confirmation dialog через Escape до подтверждения
- **THEN** dialog закрывается без DELETE
- **AND** focus возвращается к управляющему элементу меню

#### Scenario: Keyboard cannot dismiss pending destructive action
- **WHEN** пользователь подтвердил destructive delete action и mutation находится в pending state
- **THEN** Escape не закрывает dialog до завершения mutation
- **AND** destructive button остаётся disabled

#### Scenario: Pointer cannot dismiss pending destructive action
- **WHEN** пользователь подтвердил destructive delete action и mutation находится в pending state
- **THEN** Cancel, close control и interaction outside/overlay не закрывают dialog до завершения mutation
- **AND** DELETE остаётся отправленным ровно один раз

#### Scenario: Icon-only controls remain accessible
- **WHEN** destructive action trigger отображается как иконка без видимого текста
- **THEN** control имеет русское accessible name, описывающее действие и ресурс
- **AND** сама иконка не дублирует это имя для screen reader
