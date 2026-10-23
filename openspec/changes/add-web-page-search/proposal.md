## Why

В рабочей области нет единого способа быстро найти доступную страницу по названию или сохранённому содержимому. Backend full-text search уже предоставляет permission-safe API, поэтому web-клиенту нужен доступный поиск с клавиатурной и мышиной навигацией.

## What Changes

- Добавить глобальный поиск страниц из основной приватной рабочей области с `Cmd/Ctrl + K` и явной кнопкой.
- Показывать доступные backend результаты в адаптивном диалоге с loading, empty, error и keyboard selection состояниями.
- Выполнять поиск через сгенерированный Orval/TanStack Query hook и переходить на страницу через существующий маршрут приложения.
- Повторно проверять доступ в существующем private page-route flow при открытии страницы и безопасно обрабатывать его потерю без показа stale metadata.

## Capabilities

### New Capabilities
- `web-page-search`: глобальный поиск доступных страниц, управление поисковым диалогом и переход к результату.

### Modified Capabilities

## Impact

- Web FSD: новая feature поиска, минимальная интеграция в `PrivateWorkspace` и route-level revalidation в существующем workspace flow.
- `SessionProvider`: очистка user-scoped query cache при завершении сессии или смене пользователя, чтобы приватные данные не переходили между identity.
- `apps/web/src/shared/api`: экспорт уже сгенерированных search hook и DTO через публичный API barrel; generated API, OpenAPI и backend контракт не меняются.
- Тесты web: Vitest/RTL с существующими MSW handlers и один критический Playwright E2E сценарий.
- Не требуются новые зависимости, изменения БД, API или инфраструктуры.

## Out of Scope

- Изменение backend search projection/API ради breadcrumbs, дополнительных metadata или подсветки.
- Клиентская авторизация, клиентский индекс, полнотекстовая фильтрация или сортировка результатов.
- История поиска, recent pages, расширенные фильтры, AI/semantic search и универсальная command palette.
