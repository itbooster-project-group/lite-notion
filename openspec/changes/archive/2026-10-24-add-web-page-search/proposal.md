## Why

В рабочей области нет единого способа быстро найти доступную страницу по названию или сохранённому содержимому. Backend full-text search уже предоставляет permission-safe API, поэтому web-клиенту нужен доступный поиск с клавиатурной и мышиной навигацией.

## What Changes

- Добавить глобальный поиск страниц из основной приватной рабочей области с `Cmd/Ctrl + K` и явной кнопкой.
- Показывать доступные backend результаты в адаптивном диалоге с loading, empty, error и keyboard selection состояниями.
- Выполнять поиск через сгенерированный Orval/TanStack Query hook и переходить на страницу через существующий маршрут приложения.
- Повторно проверять доступ в существующем private page-route flow при открытии страницы и безопасно обрабатывать его потерю без показа stale metadata.
- Поддержать поиск по префиксам слов в title и сохранённом содержимом через существующий PostgreSQL FTS Search API, сохранив его permission filtering и websearch-операторы.

## Capabilities

### New Capabilities
- `web-page-search`: глобальный поиск доступных страниц, управление поисковым диалогом и переход к результату.

### Modified Capabilities
- `page-search`: prefix matching title/body без изменения endpoint, DTO, permission model или поисковой индексации.

## Impact

- Web FSD: feature поиска, минимальная интеграция в `PrivateWorkspace` и проверка доступа через текущий page route flow.
- API search: prefix tsquery в существующем PostgreSQL FTS repository; актуальные GIN/tsvector индексы и permission filtering сохраняются.
- `SessionProvider`: очистка user-scoped query cache при завершении сессии или смене пользователя, чтобы приватные данные не переходили между identity.
- `apps/web/src/shared/api`: экспорт уже сгенерированных search hook и DTO через публичный API barrel; generated API и OpenAPI не меняются.
- Тесты: Vitest/RTL, Search API integration tests с реальной PostgreSQL и Playwright UI E2E на существующей инфраструктуре.
- Не требуются новые зависимости, API endpoint, миграции или изменения поисковой схемы БД.

## Out of Scope

- Изменение Search API DTO ради breadcrumbs, дополнительных metadata или подсветки.
- Клиентская авторизация, клиентский индекс, полнотекстовая фильтрация или сортировка результатов.
- История поиска, recent pages, расширенные фильтры, AI/semantic search и универсальная command palette.
