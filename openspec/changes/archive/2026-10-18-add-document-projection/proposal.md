## Why

Публикациям, будущему asset pipeline и поиску нужно одинаково интерпретировать один captured Y.Doc. Backend пока не имеет локальной schema и projection boundary, поэтому отдельные потребители могли бы по-разному декодировать одни и те же persisted bytes.

## What Changes

- Добавить в API независимую от NestJS projection-функцию, преобразующую captured Yjs bytes и `tiptapSchemaVersion` в ProseMirror JSON, media references и версию применённой schema.
- Реализовать в API минимальную ProseMirror schema v1, точно соответствующую persisted schema текущего редактора. Её определения остаются backend-local и проверяются общими versioned Yjs fixtures.
- Извлекать external image references из legacy v1 `attrs.src`; зафиксировать `ImageSource` union `external | asset` для последующего развития без реализации asset nodes в этом change.
- Fail closed при ошибках decode, неизвестной версии, неподдерживаемом или теряемом содержимом и некорректных media attributes.
- Добавить реальные versioned Yjs fixtures для совместных frontend/backend schema compatibility tests. Frontend runtime и его imports/re-exports остаются без изменений.
- Не включать общий workspace package, перенос исходников, публикации, persistence renderings/assets, поиск, миграции, endpoints, storage, загрузку файлов или UI.

## Capabilities

### New Capabilities

- `document-projection`: schema-aware преобразование captured Y.Doc в JSON и derived media references.

### Modified Capabilities

Нет. Change вводит отдельный read/projection boundary и не меняет существующие capture или editor requirements.

## Impact

- Backend: новый `apps/api/src/document-projection/` с локальной schema v1, pure projection function, typed errors и unit tests.
- Test data: versioned JSON fixtures в корневом `fixtures/page-document/`, читаемые тестами API и web без общего package.
- Web: только compatibility test, сверяющий общую fixture с текущей schema; frontend runtime, editor composition, Collaboration и NodeIdDeconflict не меняются.
- Dependencies: API объявляет прямые `yjs` и `@tiptap/pm` dependencies и использует публичные Yjs XML APIs для локального read-only adapter; существующая `y-prosemirror` dependency остаётся только в web. Повторяющиеся direct dependency versions используют pnpm catalog согласно repository policy. Других workspace/package изменений нет.
- Capture contract, Y.Doc persistence, snapshots, Prisma schema и HTTP/OpenAPI контракты остаются без изменений.
