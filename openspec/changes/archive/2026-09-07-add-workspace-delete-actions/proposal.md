## Why

Backend уже поддерживает мягкое удаление страниц и проектов, а сгенерированный web-клиент содержит соответствующие DELETE mutations, но в workspace UI у пользователя нет безопасного способа удалить страницу или проект. Из-за этого обычное управление рабочей областью неполно: ресурсы можно создавать, переименовывать и перемещать, но нельзя убрать из текущего интерфейса без ручных API-вызовов.

## What Changes

- В существующих меню действий страницы появляется destructive action `Удалить`.
- Удаление страницы доступно и в основном дереве страниц проекта, и в дереве `WorkspaceNavigation`; оба представления используют одну feature-level модель удаления.
- Перед DELETE страницы открывается confirmation dialog с предупреждением, что страница и все вложенные страницы будут перемещены в корзину.
- После успешного удаления страницы workspace сразу начинает replace-navigation с route удаляемого поддерева и локально синхронизирует page tree cache без reload в безопасный момент, не показывая промежуточное unavailable state; unrelated deletion маршрут не меняет.
- Для проекта появляется destructive action `Удалить проект` в `WorkspaceNavigation` и на root workspace project cards, так как оба места являются актуальным UI управления проектами.
- Перед DELETE проекта открывается confirmation dialog с предупреждением, что проект и все его страницы будут перемещены в корзину.
- После успешного удаления проекта workspace сразу начинает replace-navigation с route удаляемого проекта и локально синхронизирует projects list cache и page tree cache в безопасный момент, не показывая промежуточное unavailable state; unrelated deletion маршрут не меняет.
- Pending state блокирует повторный submit и случайное закрытие dialog, а API error оставляет dialog открытым, не меняет cache и route и показывает доступное локальное сообщение.
- Для новых icon-only triggers и destructive affordances используются иконки из уже установленного `lucide-react` там, где иконка уместнее текста; текстовые destructive menu items и confirmation buttons остаются явными.

Явно вне scope:

- Страница корзины, список удалённых проектов или страниц.
- Restore, purge/permanent delete, empty trash, retention UI и undo.
- Backend changes, изменение OpenAPI и ручное редактирование `shared/api/generated`.
- Регенерация API без реальной необходимости.
- Project rename, глобальный state manager, глобальная toast-система и рефакторинг всего workspace.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `web-page-workspace`: добавляется наблюдаемое frontend-поведение мягкого удаления страниц и проектов из workspace UI, включая confirmation, cache synchronization, navigation, pending/error states и accessibility.

## Impact

Frontend (`apps/web`):

- `features/workspace-management`: orchestration удаления страниц и проектов, domain confirmation dialog, cache update helpers и тесты.
- `widgets/workspace-navigation`: page/project action UI, переиспользующий feature-level callbacks.
- `pages/workspace`: project cards на root route получают project delete action и общую модель удаления.
- `entities/page`: небольшие pure helpers для удаления page subtree/project pages из cached tree и определения принадлежности текущей страницы к удаляемому subtree.
- `shared/api/index.ts`: экспорт существующих generated delete mutations/query helpers, без изменения `shared/api/generated`.
- `shared/ui`: переиспользуются существующие Dialog/Menu/Button primitives; новый generic shared component не требуется.

Backend, OpenAPI, generated API output и инфраструктура не меняются. Новых зависимостей не требуется: `lucide-react` уже является прямой зависимостью `@lite-notion/web`.
