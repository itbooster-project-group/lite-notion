## Context

Мотивацию см. `proposal.md` — раздел «Why». Требуемое наблюдаемое поведение см. `specs/web-page-workspace/spec.md`.

Текущее состояние, которое определяет подход:

- `apps/web` использует Next.js App Router, FSD, TanStack Query и generated Orval hooks из `src/shared/api/generated`.
- `shared/api/generated` уже содержит `useDeletePage`, `deletePage`, `getDeletePageUrl`, `useDeleteProject`, `deleteProject` и `getDeleteProjectUrl`.
- `shared/api/index.ts` сейчас экспортирует create/rename/move operations, но не экспортирует delete operations наружу.
- `features/workspace-management/model/use-page-management.ts` уже владеет mutations страниц и обновляет `getGetPageTreeQueryKey()` через `setQueryData` с rollback/invalidation для optimistic rename/move.
- `features/workspace-management/model/use-project-creation.ts` владеет созданием проекта и обновляет `getListProjectsQueryKey()`.
- Основное дерево проекта (`features/workspace-management/ui/page-tree.tsx`) и sidebar tree (`widgets/workspace-navigation/ui/workspace-tree.tsx`) получают page callbacks сверху и не вызывают generated API напрямую.
- `entities/page/model/page-tree.ts` уже содержит canonical normalized tree, `getAncestorChain`, `selectPage`, `buildProjectPageTree` и helpers для create/rename/move cache updates.
- Shared UI уже имеет `Dialog`, `Menu`, `MenuItem variant="destructive"` и `Button variant="destructive"`. `lucide-react` уже установлен в `@lite-notion/web` и является текущей icon convention для новых controls.
- Workspace routes сейчас собираются строками `"/"`, `"/projects/${id}"`, `"/pages/${id}"`; отдельного route helper нет.
- `WorkspaceRouteContext` сейчас объявлен в `pages/workspace`, и импортировать его из `features/workspace-management` нельзя: зависимость `features → pages` нарушает FSD.
- App Router структура сейчас такая: `apps/web/app/(private)/layout.tsx` сохраняется между private routes, а `apps/web/app/(private)/page.tsx`, `projects/[projectId]/page.tsx` и `pages/[pageId]/page.tsx` являются отдельными page adapters, каждый из которых заново рендерит `WorkspacePage route={...}`. Отдельного persistent workspace layout для `root ↔ project ↔ page` сейчас нет.
- `usePageManagement()` сейчас создаётся внутри `WorkspacePage`. Значит state внутри этого hook instance не должен считаться переживающим переходы между `/`, `/projects/:id` и `/pages/:id`: при смене sibling route adapter `WorkspacePage` может быть размонтирован и создан заново.

## Goals / Non-Goals

**Goals:**

- Держать API mutation ownership в feature-level model, а не в widgets/pages UI.
- Использовать один delete orchestration для обоих page tree представлений.
- Обновлять обычный workspace UI после successful DELETE без reload и без optimistic removal.
- Не оставлять route на удалённую страницу, удалённое поддерево или удалённый проект и не показывать промежуточное unavailable state при локальной cache sync.
- Передавать текущий route context в feature без зависимости `features → pages`.
- Сохранить доступность menu/dialog/button flow, текущую lucide icon convention и локальную error presentation.

**Non-Goals:**

- Не добавлять frontend trash/restore/purge/undo flows.
- Не менять backend, OpenAPI и generated files вручную.
- Не вводить глобальный store, toast framework или новый shared domain component.
- Не переводить все существующие workspace URL на route helper в рамках большого refactor; helper нужен только для touched delete/create/navigation call sites, где это не раздувает change.

## Decisions

### 1. Delete orchestration живёт в `workspace-management/model`

Удаление страниц расширяет существующий `usePageManagement`: hook добавляет `useDeletePage`, метод `deletePage` и pending flag. Удаление проектов оформляется отдельным feature hook рядом с `use-project-creation`, например `useProjectDeletion`, потому что оно владеет `useDeleteProject`, projects cache и page tree cache.

UI-слои получают callbacks и state через props. `WorkspaceNavigation`, `WorkspaceTree`, `PageTree`, root project cards и item components не импортируют generated mutation hooks напрямую.

Альтернатива — вызвать `useDeletePage` прямо из каждого tree component. Она отвергнута: два дерева начали бы владеть одной бизнес-операцией и неизбежно разошлись бы в cache/route/error behavior.

### 2. Route context живёт в нижнем routing/shared contract

Минимальный workspace route type и path helpers переносятся из `pages/workspace` в допустимый нижний слой, предпочтительно новый `src/shared/routing` или существующий routing/shared module, если он уже подходит по импорту. Контракт содержит только:

- workspace root route: `{ type: 'root' }`;
- project route: `{ type: 'project'; projectId: string }`;
- page route: `{ type: 'page'; pageId: string }`;
- helpers `workspaceRootPath()`, `workspaceProjectPath(projectId)`, `workspacePagePath(pageId)`.

`WorkspacePage` и App Router page adapters определяют текущий route context и передают его в feature-level deletion orchestration. Feature hooks получают текущий `routeContext` параметром от `WorkspacePage`, например `usePageManagement(routeContext)` и `useProjectDeletion(routeContext)`. Delete methods используют этот context как актуальное состояние на момент confirm.

Для deferred cleanup одного route context параметра в hook недостаточно: текущий `WorkspacePage` может размонтироваться при переходе между sibling route adapters. Поэтому implementation добавляет тонкий App Router route-group layout для workspace routes, например `apps/web/app/(private)/(workspace)/layout.tsx`, и переносит существующие route adapters `/`, `/projects/[projectId]`, `/pages/[pageId]` внутрь этой route group без изменения URL. В этом layout рендерится workspace-local cleanup coordinator/provider из `features/workspace-management`. Он переживает переходы `root ↔ project ↔ page`, потому что меняется только child route, а route group layout остаётся mounted.

`WorkspacePage` остаётся владельцем screen composition и сообщает coordinator текущий `routeContext` при mount/изменении prop. Если route transition не размонтировал `WorkspacePage`, coordinator получает новый context из того же дерева. Если transition размонтировал старый `WorkspacePage` и смонтировал новый, pending cleanup record остаётся в provider, а новый `WorkspacePage` сообщает target context и тем самым завершает cleanup. Feature hooks не импортируют layout или `pages`: они получают функции coordinator через feature-level context и планируют deferred cleanup после successful affected DELETE.

Это не нарушает FSD: направление зависимостей остаётся `pages/widgets → features/workspace-management → entities/shared`. Feature импортирует только минимальный routing contract из `shared`, а не `WorkspaceRouteContext` из `pages/workspace`. Tree/item components не парсят route и не дублируют routing logic.

Альтернатива — оставить type в `pages/workspace` и импортировать его в feature. Она запрещена зависимостью `features → pages`. Альтернатива — заставить feature читать `usePathname()` и парсить URL самостоятельно. Она отвергнута: route parsing дублировался бы между page/project delete и усложнил бы тестирование. Альтернатива — передавать context только аргументом `deletePage(pageId, routeContext)` — недостаточна для deferred cleanup: feature увидит route на момент confirm, но без persistent coordinator не сможет гарантированно заметить, что route transition уже применился после remount.

### 3. Confirmation dialog domain-specific, primitives остаются shared

В `features/workspace-management/ui` добавляется domain confirmation component для delete intent. Он использует существующие `Dialog`, `DialogTitle`, `DialogDescription`, `DialogClose`, `Button` и `Text`.

Тексты `Удалить страницу?`, `Удалить проект?`, `Отмена`, `Удалить` остаются domain-level. Description всегда строится из актуального intent: `Страница «{title}» и все вложенные страницы будут перемещены в корзину.` или `Проект «{name}» и все его страницы будут перемещены в корзину.` Если пользователь последовательно открывает dialog для разных ресурсов, старый title/name не должен сохраняться.

Кнопка подтверждения использует destructive variant и pending label `Удаляем…`. Error отображается внутри dialog через `Text role="alert" variant="error"`.

Новый generic `AlertDialog` в `shared/ui` не добавляется: текущего `Dialog` достаточно для focus management до подтверждения и после error, а domain-specific copy не должен переезжать в shared.

### 4. Pending semantics блокирует accidental close

До отправки DELETE `Отмена`, Escape, close control и interaction outside/overlay закрывают dialog без mutation, без cache/route changes и с возвратом focus к trigger.

После confirm и до завершения mutation dialog считается locked: повторный submit игнорируется, destructive button disabled, отображается `Удаляем…`, а Cancel, Escape, close control и interaction outside/overlay не закрывают dialog. Это снижает риск, что пользователь потеряет контекст destructive operation после запуска запроса.

После success dialog закрывается как часть successful flow/navigation. После error pending снимается, dialog остаётся открыт, пользователь видит локальный `role="alert"` и снова может закрыть dialog любым обычным способом или повторить delete.

Альтернатива — блокировать только Cancel/Escape. Она отвергнута: текущий dialog primitive может закрываться outside/overlay interaction или close control, а во время pending любое случайное скрытие dialog одинаково прячет состояние уже запущенной destructive operation.

### 5. Оба page trees переиспользуют одну page delete логику

`PageTree` и `WorkspaceTree` добавляют props для запуска удаления страницы: item menu только формирует delete intent `{ pageId, title, returnFocus }` и открывает feature dialog. Сам DELETE выполняет один callback из `usePageManagement`.

В `PageTreeItem` и `WorkspaceTreeItem` добавляется destructive `MenuItem` `Удалить`. Для новых icon-only triggers используются lucide icons, например `MoreHorizontal`, `Trash2` или близкие по смыслу, но visible menu item text сохраняется.

Альтернатива — отдельный dialog внутри каждого item. Она отвергнута: pending/error/focus handling стало бы дублироваться на два дерева.

### 6. Project delete интегрируется в navigation и root cards

`WorkspaceNavigation` получает project action surface: project item в `WorkspaceTreeItem` больше не ограничивается кнопкой создания страницы, а получает menu или компактный icon action area с созданием root page и `Удалить проект`.

Root workspace project cards получают тот же `onDeleteProject` callback и тот же confirmation dialog. Card остаётся навигационной ссылкой на проект, а destructive action должен быть отдельной semantic button/menu item, чтобы click по delete не активировал navigation.

Альтернатива — оставить project delete только в sidebar. Она отвергнута: root workspace page уже является основным списком проектов и местом создания проекта, поэтому отсутствие delete action там выглядит как неполное управление проектами.

### 7. Cache update strategy: success-only `setQueryData` + targeted invalidation

Для destructive operations optimistic removal не нужен: rollback не даёт явного UX-выигрыша, а ошибка удаления не должна преждевременно убирать ресурс из UI. Поэтому cache меняется только после successful `mutateAsync`.

Для unrelated delete cache cleanup выполняется сразу после success. Для affected delete используется deferred cache removal: локальный cache не удаляет данные, необходимые старому route, пока этот старый route ещё может быть отрендерен как активный.

Page delete:

- до mutation взять `getGetPageTreeQueryKey()`, текущий cached tree, normalized tree, delete context и redirect target;
- если текущий route относится к удаляемому subtree, перед DELETE отменить in-flight `getGetPageTreeQueryKey()` через `queryClient.cancelQueries`, чтобы уже запущенный refetch не мог обновить cache деревом без удалённой active страницы до commit нового route;
- если текущий route относится к удаляемому subtree, после success вызвать `router.replace(workspaceProjectPath(projectId))`, закрыть dialog и передать в persistent cleanup coordinator pending cleanup record с deleted subtree ids, project id и old affected route identity;
- coordinator наблюдает route context, который сообщает текущий `WorkspacePage`; когда context больше не является старой active page route внутри удалённого subtree, coordinator удаляет page subtree из cached `PageTreeNodeDto[]`, запускает targeted invalidation page tree query и сбрасывает record;
- navigation не ждёт network refetch, потому что cleanup/invalidation происходят после observable route context change и не являются условием вызова `router.replace`.

Unrelated page delete не вызывает navigation: после success только локально удаляет subtree и invalidates page tree query.

Project delete:

- до mutation определить, относится ли текущий route к удаляемому project;
- если текущий route относится к удаляемому project, перед DELETE отменить in-flight `getGetPageTreeQueryKey()` и `getListProjectsQueryKey()` через `queryClient.cancelQueries`, чтобы refetch не мог убрать active project/page из cache до commit нового route;
- если текущий route относится к удаляемому project, после success вызвать `router.replace(workspaceRootPath())`, закрыть dialog и передать в persistent cleanup coordinator pending cleanup record с deleted project id и old affected route identity;
- coordinator наблюдает route context, который сообщает текущий `WorkspacePage`; когда context больше не является route удалённого проекта или page route внутри него, coordinator удаляет project из `getListProjectsQueryKey()`, удаляет все страницы проекта из `getGetPageTreeQueryKey()`, запускает targeted invalidation projects list и page tree queries и сбрасывает record;
- navigation не ждёт network refetch.

Unrelated project delete не вызывает navigation: после success сразу удаляет project и его страницы из local cache и invalidates targeted queries.

Single page queries (`getGetPageQueryKey(pageId)`) и document queries могут быть removed/invalidated opportunistically только для удаляемой текущей страницы, если это уже импортируется без усложнения. Обязательный критерий acceptance держится tree/list cache и redirect.

Deferred cleanup гарантирует отсутствие `WorkspaceUnavailable` flash: пока App Router ещё передаёт старый route prop, cached data для этого route не удалены, поэтому `WorkspacePage` продолжает находить `activePage`/`project` и не попадает в unavailable branch. Когда route prop уже сменился на target route и текущий `WorkspacePage` сообщил новый context persistent coordinator, старый deleted route больше не может быть отрендерен как active, и local cache removal становится безопасным. Если route transition сопровождается unmount/remount `WorkspacePage`, record не теряется, потому что принадлежит route-group layout provider, а не hook instance старого route.

Альтернатива — cache update перед navigation. Она отвергнута: active route может на короткое время остаться указывать на ресурс, который уже исчез из local cache, и workspace может показать unavailable/not-found state. Альтернатива — простой порядок `router.replace → setQueryData` без deferred cleanup — тоже отвергнута: вызов `replace` не гарантирует смену route до следующего render. Альтернатива — transitional state в `WorkspacePage` — рабочая, но требует отдельного UI state для подавления unavailable branch; deferred cleanup проще, потому что сохраняет старые данные до фактической смены route. Альтернатива — только invalidation. Она отвергнута: UI может оставаться со старым resource до refetch. Альтернатива — optimistic delete — отвергнута как избыточная для destructive operation.

### 8. Subtree и project membership определяются через текущую entity tree

Для page delete перед mutation вычисляется delete context из текущего `NormalizedPageTree`: удаляемая page, её `projectId` и множество id поддерева. Это множество строится из `childIdsByParentId`; отдельная копия дерева или новый state manager не создаются.

Текущая route считается затронутой page delete, если route type `page` и active page id входит в удаляемое subtree. Удаление ancestor текущей страницы покрывается тем же условием. Если удаляемая page не найдена в текущем tree, UI не должен отправлять delete из обычного action menu; если context устарел между menu open и confirm, operation должна fail безопасно без route/cache changes.

Project delete использует route context и normalized tree:

- route type `project` затронут, если `route.projectId === deletedProjectId`;
- route type `page` затронут, если active page существует и `activePage.projectId === deletedProjectId`.

### 9. Deferred cleanup lifecycle владеет persistent workspace coordinator

Pending cleanup records не живут только в state `usePageManagement` или `useProjectDeletion`, потому что эти hooks создаются внутри `WorkspacePage`, а текущая App Router структура допускает remount `WorkspacePage` между root/project/page adapters. Владелец record — workspace-local cleanup coordinator/provider, отрендеренный в persistent workspace route-group layout внутри `(private)`.

Этот provider не является global state:

- он расположен только вокруг workspace routes, а не вокруг всего приложения;
- state transient и неперсистентный, существует только между successful affected DELETE и безопасной точкой cleanup;
- record не записывается в TanStack Query, URL, `window`, storage или внешний store;
- layout не владеет generated mutations и не переносит domain delete logic из feature.

Feature-level model по-прежнему владеет generated DELETE mutation, вычислением delete context, redirect target и cache cleanup operation. Coordinator хранит lifecycle record и вызывает idempotent cleanup helpers в безопасный момент. `WorkspacePage` сообщает route context coordinator и по-прежнему решает, когда показывать `WorkspaceUnavailable`. Feature hook не импортирует `pages/workspace`, не парсит pathname и не требует polling router state.

Pending cleanup record содержит только immutable минимум, вычисленный до mutation и не требующий повторного поиска удалённого ресурса после success:

- для page delete: kind/id record, `projectId`, удаляемый page id, id поддерева или эквивалентный immutable delete context, old affected route identity;
- для project delete: kind/id record, `projectId`, old affected route identity.

Record не хранит весь normalized tree, React components, DOM refs, mutable query objects или сырые API responses без необходимости.

Cleanup MUST быть idempotent. Page cleanup повторно фильтрует subtree ids и безопасен, если часть ids уже отсутствует; unrelated pages не удаляются. Project cleanup повторно фильтрует project list/page tree по `projectId` и безопасен, если project/pages уже отсутствуют. После выполнения cleanup coordinator сбрасывает pending record; если effect lifecycle вызовет cleanup повторно до сброса, pure helpers не должны создать некорректное состояние. Повторная targeted invalidation допустима, но implementation должен избегать лишних вызовов через сброс record после завершения cleanup.

Если navigation не завершилась, timeout/polling fallback не добавляется. DELETE уже успешен, а старый cache временно сохранён специально, чтобы старый route мог безопасно рендериться. Cleanup выполняется после observable route context change; network refetch не является условием navigation.

### 10. Redirect использует `replace`, а не `push`

Affected delete flows используют `router.replace`, а не `router.push`, чтобы текущая history entry удаляемого active route была заменена target route. Это означает, что обычный Back после удаления не возвращает пользователя на ту entry, с которой было выполнено удаление.

Это не является гарантией очистки всего browser history stack. Если до текущей entry в истории уже были другие routes того же удалённого поддерева или проекта, browser может вернуться к ним позднее; обработка такого старого entry как unavailable/redirect не входит в scope этого change. Implementation не должен добавлять ручной `history.replaceState`, цепочки redirect, вызовы `router.back()` или другие попытки чистить browser history.

Navigation инициируется после successful DELETE. Для affected delete локальная cache removal и invalidation выполняются только после observable route context change. Navigation не ждёт `invalidateQueries`: refetch нужен для reconciliation, а не для разрешения route.

### 11. Error остаётся локальным

Dialog хранит local error message и pending state. При ошибке raw backend detail не показывается; используется локальный текст вроде `Ошибка удаления страницы. Попробуйте ещё раз.` или `Ошибка удаления проекта. Попробуйте ещё раз.`

Глобальная toast-система не вводится. Это сохраняет текущий pattern workspace: form/dialog errors показываются рядом с действием через `role="alert"`.

## Risks / Trade-offs

- **Stale tree context между открытием dialog и подтверждением** → delete callback перед отправкой повторно сверяет resource в текущем normalized tree; при отсутствии context показывает локальную ошибку и не меняет route/cache.
- **Route transition может задержаться после `router.replace`** → deferred affected cache removal сохраняет данные старого route до observable смены `routeContext`; tests должны имитировать delayed route transition и проверять отсутствие `Ничего не найдено`.
- **In-flight refetch может завершиться между successful DELETE и route commit** → affected delete перед mutation отменяет relevant active queries; tests должны запускать delayed refetch, завершать его после DELETE и проверять отсутствие `Ничего не найдено` на старом route.
- **`WorkspacePage`/feature hook может remount'иться во время navigation** → pending cleanup record хранится в persistent workspace route-group layout provider, а не в route-scoped hook instance; tests должны имитировать unmount/remount и проверять, что cleanup всё равно завершается.
- **Два project action surfaces могут разойтись** → оба вызывают один `onRequestDeleteProject` и один confirmation dialog, тесты покрывают navigation и root cards.
- **Success-only cache update медленнее optimistic removal** → для destructive action корректность и отсутствие rollback важнее мгновенного исчезновения до ответа.
- **Route helper introduction может разрастись в refactor** → ограничить helper только workspace paths и touched call sites.
- **Focus после закрытия dialog из разных menus/cards** → delete intent хранит `returnFocus`; dialog использует existing primitive final focus до confirm/после error, а tests проверяют Escape/Cancel/outside close before confirm and after error.

## Migration Plan

Миграций данных, backend rollout и OpenAPI regeneration нет. Change разворачивается как обычное frontend изменение: после выкладки UI начнёт вызывать уже существующие DELETE endpoints. Rollback frontend-PR просто убирает action controls; backend soft-delete endpoints остаются совместимыми.
