# web-page-workspace Specification

## Purpose

Определяет наблюдаемое поведение единой рабочей области Lite Notion: дерево проектов и страниц, маршруты и операции над страницами.
## Requirements
### Requirement: Единая приватная рабочая область

Web-приложение ДОЛЖНО (MUST) показывать единую рабочую область на `/`, `/projects/{projectId}` и `/pages/{pageId}`. `/` ДОЛЖЕН показывать список всех проектов и создание проекта; на широком экране поле названия и кнопка формы располагаются в одну строку. `/projects/{projectId}` ДОЛЖЕН выбирать проект без активной страницы; `/pages/{pageId}` ДОЛЖЕН выбирать страницу независимо от глубины. Недоступные идентификаторы ДОЛЖНЫ показывать единое безопасное состояние со ссылкой на `/`.

#### Scenario: Открытие проекта

- **КОГДА** пользователь открывает доступный `/projects/{projectId}`
- **ТОГДА** рабочая область показывает в контентной области дерево страниц этого проекта без активной страницы

### Requirement: Дерево проектов и страниц

Боковая навигация ДОЛЖНА (MUST) показывать один доступный Headless Tree с единственным `role="tree"`: верхние видимые узлы — проекты в порядке API, потомки — их страницы в серверном порядке и произвольной глубине. Проекты и страницы ДОЛЖНЫ быть `treeitem`, а клавиатурная навигация ДОЛЖНА последовательно проходить между ними. Раскрытие проектов ДОЛЖНО сохраняться при переходах внутри workspace и обновлениях серверного кэша. Каждый следующий уровень страниц ДОЛЖЕН иметь дополнительный визуальный отступ. Узел проекта ДОЛЖЕН открывать `/projects/{projectId}`, а узел страницы — `/pages/{pageId}`. Проекты НЕ ДОЛЖНЫ поддерживать переименование, перемещение или быть целями DnD страниц; кнопка с доступным именем создания страницы располагается рядом с названием проекта, а пустой проект предлагает создание корневой страницы.

#### Scenario: Несколько проектов

- **КОГДА** API возвращает несколько проектов и их страницы
- **ТОГДА** каждый проект отображается верхним узлом одного дерева, а страницы не смешиваются между проектами

#### Scenario: Клавиатурный переход между типами узлов

- **КОГДА** раскрытый проект и его страницы находятся рядом со следующим проектом
- **ТОГДА** клавиши дерева перемещают фокус между project и page treeitem в общем порядке

### Requirement: Редактируемое дерево проекта

Контентная область `/projects/{projectId}` ДОЛЖНА (MUST) показывать только страницы этого проекта и ДОЛЖНА поддерживать создание, встроенное переименование, DnD мышью и клавиатурой и диалог перемещения с теми же правилами, что и дерево навигации. Любая страница ДОЛЖНА принимать дочерние страницы, даже если у неё пока нет потомков; индикатор раскрытия ДОЛЖЕН показываться только при фактическом наличии потомков. Оба представления ДОЛЖНЫ использовать одно каноническое серверное состояние и одну проверку допустимости перемещения. Создание ДОЛЖНО валидировать обрезанное название длиной 1–255, переименование и перемещение ДОЛЖНЫ использовать оптимистичное обновление и откат, а перемещение ДОЛЖНО запрещать саму страницу, её потомков и цели из другого проекта.

#### Scenario: Изменение из content tree

- **КОГДА** пользователь создаёт, переименовывает или перемещает страницу в `/projects/{projectId}`
- **ТОГДА** навигация и дерево контента отражают одно подтверждённое либо оптимистичное состояние без полной перезагрузки

#### Scenario: Перемещение внутрь пустой страницы

- **КОГДА** пользователь перетаскивает страницу A на страницу B без потомков
- **ТОГДА** страница A становится первым ребёнком страницы B

### Requirement: Доступность и состояния данных

Дерево ДОЛЖНО (MUST) использовать `tree`/`treeitem`, клавиатурную навигацию и доступные имена. Состояния загрузки, ошибки и пустого списка ДОЛЖНЫ различаться; ошибка ДОЛЖНА предоставлять повтор без сырых деталей backend. Мобильная навигация ДОЛЖНА закрываться по Escape с восстановлением фокуса. Контент активной страницы ДОЛЖЕН показывать хлебные крошки и заголовок без запроса PageDocument.

#### Scenario: Работа с клавиатурой

- **КОГДА** фокус находится внутри дерева
- **ТОГДА** пользователь может раскрывать узлы, активировать и переименовывать страницу, а также выполнить доступное перемещение без указателя

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

### Requirement: Page routes compose the collaborative editor

Workspace page route MUST создавать и уничтожать page document session вместе с active `pageId` и MUST передавать session в существующий PageEditor через page-level composition. Navigation, page title и page metadata MUST продолжать работать независимо от WebSocket connection state.

#### Scenario: Active page mounts its editor
- **WHEN** workspace resolves a live page route
- **THEN** page composition создаёт collaboration session для этого page id
- **AND** editor отображает loading state до initial Yjs sync

#### Scenario: Active page changes
- **WHEN** user navigates from page A to page B
- **THEN** session A destroyed
- **AND** session B подключается к room `page:<pageBId>` без утечки listeners или Y.Doc A

#### Scenario: Collaboration is unavailable
- **WHEN** metadata page loaded, но collaboration service недоступен
- **THEN** page title и workspace navigation остаются доступными
- **AND** editor показывает безопасное состояние ошибки/соединения

### Requirement: Owned and shared page data remain separate

Workspace MUST загрузить owned pages через существующий page-tree endpoint и shared pages через `GET /pages/shared`, используя public API `shared/api`. Эти ответы MUST храниться как два независимых data source; shared pages MUST NOT добавляться в owned tree или смешиваться с ним для navigation и route resolution. Pure selectors MUST уметь разрешать page context и ancestor chain; конкретный способ обхода или normalization indexes выбирается реализацией.

#### Scenario: Shared pages are available
- **WHEN** `GET /pages/shared` возвращает доступные страницы
- **THEN** workspace показывает их в отдельной секции `Доступные мне`
- **AND** owned projects и owned pages остаются в существующем дереве

#### Scenario: Shared list is empty
- **WHEN** `GET /pages/shared` возвращает пустой список
- **THEN** секция `Доступные мне` показывает доступное empty state
- **AND** owned workspace продолжает работать

### Requirement: Shared navigation is read-only

Секция `Доступные мне` MUST показывать hierarchy shared pages и поддерживать переход к `/pages/{pageId}`. Она MUST NOT показывать или вызывать owner-only операции создания, переименования, перемещения или удаления страниц/проектов и MUST NOT использовать фиктивные mutation handlers.

#### Scenario: User navigates shared hierarchy
- **WHEN** пользователь раскрывает shared page и выбирает вложенную страницу
- **THEN** navigation открывает существующий route `/pages/{pageId}`
- **AND** hierarchy сохраняет структуру, полученную от backend

#### Scenario: Shared navigation has no mutation controls
- **WHEN** shared page отображается в navigation
- **THEN** рядом с ней отсутствуют controls create, rename, move и delete
- **AND** shared tree не принимает owned mutation callbacks

### Requirement: Shared page routes resolve without owned project membership

Для `/pages/{pageId}` workspace MUST искать страницу в owned и shared trees и явно определять source `owned` или `shared`. Owned page MUST иметь приоритет при совпадении id. Shared page MUST открываться независимо от наличия её `projectId` среди `ProjectDto` текущего пользователя. Existing project routes MUST сохранять проверку owned project.

#### Scenario: Direct navigation to shared page
- **GIVEN** shared tree содержит страницу `page-42`
- **AND** список owned projects не содержит её `projectId`
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает страницу и её collaborative editor
- **AND** не показывает `WorkspaceUnavailable` только из-за отсутствующего owned project

#### Scenario: Owned page opens while shared query is loading
- **GIVEN** owned tree успешно содержит страницу `page-42`
- **AND** shared query ещё выполняется
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace сразу открывает owned page
- **AND** shared loading влияет только на секцию `Доступные мне`

#### Scenario: Owned page opens while shared query fails
- **GIVEN** owned tree успешно содержит страницу `page-42`
- **AND** `GET /pages/shared` отвечает ошибкой
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace открывает owned page
- **AND** ошибка отображается только в секции `Доступные мне`

### Requirement: Shared page route exposes explicit loading, error and not-found states

Для `/pages/{pageId}` workspace MUST сначала дождаться owned tree. Если page найдена в owned tree, она MUST быть разрешена сразу, а shared query MUST NOT блокировать route. Если page не найдена в owned tree, workspace MUST учитывать shared query: loading показывает pending state, error показывает page-level error state с retry, а successful shared query без page позволяет показать `WorkspaceUnavailable`. Общий route loading, основанный на `ownedLoading || sharedLoading`, MUST NOT блокировать уже найденную owned page.

#### Scenario: Shared query is still loading after owned lookup misses
- **GIVEN** page отсутствует в owned tree
- **AND** shared query ещё выполняется
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает loading state
- **AND** не показывает `WorkspaceUnavailable`

#### Scenario: Shared query fails for an unknown owned page
- **GIVEN** page отсутствует в owned tree
- **AND** `GET /pages/shared` завершился ошибкой
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает безопасный page-level error state
- **AND** предлагает повторить shared query

#### Scenario: Page is absent after required queries succeed
- **GIVEN** owned и shared queries успешно завершились
- **AND** page отсутствует в обоих sources
- **WHEN** пользователь открывает `/pages/page-42`
- **THEN** workspace показывает `WorkspaceUnavailable`

### Requirement: Shared data failures are isolated from owned workspace

Ошибка или загрузка shared query MUST показываться в пределах секции `Доступные мне` и по возможности не должна скрывать успешно загруженные owned projects и owned tree. Пользователь MUST получить retry для shared query; сырые backend details MUST NOT отображаться.

#### Scenario: Shared query fails
- **WHEN** `GET /pages/shared` отвечает ошибкой
- **THEN** owned projects и owned navigation остаются доступны, если их queries успешны
- **AND** секция показывает безопасное error state с действием повторить

#### Scenario: Shared query retries successfully
- **WHEN** пользователь запускает retry после ошибки shared query
- **AND** повторный запрос успешен
- **THEN** секция заменяет error state hierarchy shared pages

### Requirement: Shared breadcrumbs identify the shared source without foreign metadata

Для shared page breadcrumbs MUST использовать понятную synthetic source label `Доступные мне`, затем доступных shared ancestors и текущую page title. Breadcrumbs MUST NOT требовать или придумывать project name или owner metadata, которых нет в API.

#### Scenario: Shared page breadcrumbs are displayed
- **GIVEN** shared hierarchy содержит `Parent` и страницу `Child`
- **WHEN** пользователь открывает shared `Child`
- **THEN** breadcrumbs показывают `Доступные мне / Parent / Child`
- **AND** не показывают выдуманное имя проекта или владельца

### Requirement: Page actions follow capabilities

Workspace page trees MUST receive the centralized page capabilities calculated from each target node's own `accessRole` and MUST expose only actions allowed for that target role. Active page capabilities MUST NOT gate actions for arbitrary neighboring nodes. Viewer MUST NOT receive create child, rename, move, delete or drag controls; editor MUST receive only mutations supported for editor role by the existing API; owner MUST receive the full existing page action set.

#### Scenario: Viewer navigates a page tree
- **WHEN** viewer opens a page in workspace navigation or the project tree
- **THEN** page mutation controls are hidden or disabled while navigation remains usable

#### Scenario: Editor navigates a page tree
- **WHEN** editor opens an editable page
- **THEN** content and allowed page actions are available
- **AND** permissions management remains hidden

#### Scenario: Target node role controls its actions
- **GIVEN** active page имеет роль `viewer`, а соседний target node имеет роль `owner`
- **WHEN** workspace показывает действия target node
- **THEN** target node получает owner actions независимо от роли active page

#### Scenario: Tree DTO provides target roles
- **WHEN** frontend получает page tree
- **THEN** каждый page node содержит backend-provided `accessRole`, включая nested nodes
- **AND** frontend не выводит target role из active page и не вычисляет inheritance

### Requirement: Shared page route remains independent of owned permissions UI

Shared page content and breadcrumbs MUST NOT be blocked by the owned projects query. Shared pages MUST use their backend-provided effective role for readonly/editor behavior, while owner-only page-access controls are not shown for shared routes unless the page role itself is `owner`.

#### Scenario: Owned projects query is pending or failed
- **WHEN** a shared page route is open and owned projects query is pending or failed
- **THEN** shared page content and breadcrumbs continue to render according to shared context
- **AND** no owned permissions metadata is used
