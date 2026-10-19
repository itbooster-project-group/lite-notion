## Why

После backend #47 приложение умеет хранить изображения и выдавать временные ссылки, но интерфейс не позволяет управлять аватарами и обложками или вставлять загруженные изображения в совместный редактор. Изменение закрывает этот пользовательский путь и задаёт общий presentation-контракт, который сможет использовать будущий SSR renderer из #53.

## What Changes

- Добавить общий frontend API и локальное состояние upload операции с progress, подтверждением ready по успешному content PUT, ограниченным retry и unavailable fallback для недоступных assets.
- Добавить управление собственным аватаром и отображение аватаров участников совместной сессии.
- Добавить обложку страницы с учётом прав владельца/редактора и безопасным отображением для viewer.
- Добавить TipTap image node для asset-backed изображений со стабильными `nodeId` и `assetId`, согласованными `alt`/`decorative`; загружать asset до записи node в Y.Doc и сохранять совместимость с существующими внешними изображениями.
- Разделить авторизованный resolver signed URL и чистый SSR-compatible presentation-компонент без зависимостей от API, auth, query cache, редактора и Yjs.
- Дополнить nullable `avatarAssetId` и `coverAssetId` в API DTO, чтобы frontend мог восстановить ссылки на выбранные assets после reload.
- Добавить Vitest/RTL и collaboration E2E проверки сценариев загрузки, восстановления, прав и синхронизации.

Вне scope: public renderer #53, backend-функции кроме минимального дополнения DTO, новые глобальные state libraries, галереи, video/audio и универсальный upload framework.

## Capabilities

### New Capabilities
- `web-asset-presentation`: общий API/query слой загрузки и SSR-compatible представление asset-backed изображений.
- `web-profile-avatar`: загрузка, замена, удаление и отображение аватара пользователя.

### Modified Capabilities
- `asset-management`: добавить стабильные nullable asset ID в ответы API профиля и страницы.
- `collaboration-presence`: отображать актуальные аватары участников через presence без изменения Y.Doc.
- `web-page-workspace`: отображать и редактировать обложку страницы с учётом разрешений.
- `web-page-editor`: вставлять загруженные asset-backed изображения в TipTap/Y.Doc с сохранением совместимости.

## Impact

- Frontend: `apps/web` shared API, entities, features, widgets/pages, editor schema/NodeView, static rendering, MSW, Vitest/RTL и существующий collaboration E2E.
- Backend API contract: аддитивные nullable `avatarAssetId` и `coverAssetId` в существующих DTO и соответствующее обновление OpenAPI/generated client; поля уже существуют в модели данных. Новые endpoints, таблицы и миграции не предполагаются.
- Интеграция использует endpoints и permission checks backend #47; signed URL остаётся эфемерным UI-данным и не попадает в Y.Doc.
- Будущая возможность использовать общий image presentation в #53; публичный renderer в этом change не создаётся.
