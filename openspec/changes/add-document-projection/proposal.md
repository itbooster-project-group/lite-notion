## Why

Публикация, asset projection и поиск должны получать представление одного и того же captured Y.Doc, интерпретированное по той же TipTap schema. Сейчас преобразование и schema находятся в web-приложении, поэтому backend-потребители рискуют реализовать отдельные несовместимые декодеры.

## What Changes

- Добавить повторно используемый boundary, который из захваченных Yjs bytes и версии schema строит ProseMirror JSON и список media references.
- Закрепить browser-independent schema и Yjs conversion в общем workspace package, используемом web и API.
- Добавить в API чистую projection-операцию без capture, БД, Hocuspocus, HTTP controller или изменения исходного Y.Doc.
- Определить безопасное представление external image URL и внутренних asset references, сохраняя совместимость с текущим image node.
- Не включать публикации, сохранение renderings/assets, поиск, новые endpoints, загрузку файлов или editor UI.

## Capabilities

### New Capabilities
- `document-projection`: schema-aware преобразование captured Y.Doc в JSON и derived media references.

### Modified Capabilities

Нет. Существующие требования к документу, editor schema и capture не меняются; добавляется backend read/projection capability.

## Impact

- Backend: новый `apps/api/src/document-projection/` module и unit tests.
- Общая модель документа: новый browser-independent workspace package, извлекающий schema version, schema extensions и Yjs-to-ProseMirror conversion из web entity; web продолжает использовать тот же контракт.
- Зависимости: разместить TipTap schema и Yjs conversion dependencies в общем package, не добавлять browser-only или NestJS runtime dependencies в него.
- Persistence, capture contract, Prisma schema, OpenAPI, collaboration protocol и frontend UI не меняются.
