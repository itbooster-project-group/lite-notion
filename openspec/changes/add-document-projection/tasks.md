## 1. Общий document schema package

- [ ] 1.1 Создать browser-independent `apps/page-document` package и перенести туда текущие schema v1, schema version, Yjs field и Yjs-to-ProseMirror conversion без изменения persisted nodes, attrs и defaults.
- [ ] 1.2 Перевести web editor, static rendering и существующие Yjs utilities на общий package; оставить Collaboration provider/caret, React и editor UI в web.
- [ ] 1.3 Объявить прямые TipTap/Yjs dependencies у package, вынести повторно используемые версии в pnpm catalog и обновить lockfile через pnpm.
- [ ] 1.4 Проверить package и web fixtures на прежний набор nodes/marks, schema version 1, `default` Yjs field, пустой документ и прежний JSON для текста, formatting и media.

## 2. Backend Document Projection

- [ ] 2.1 Добавить чистый API projection boundary с входом `yjsState` + `tiptapSchemaVersion` и выходом `contentJson`, `mediaReferences`, `schemaVersion`; не вызывать capture, HTTP, Hocuspocus, Prisma или editor transaction.
- [ ] 2.2 Добавить явные ошибки для неизвестной schema version, decode failure, неподдерживаемого node и некорректного media mapping; гарантировать отсутствие частичного JSON и изменения входных bytes.
- [ ] 2.3 Реализовать image mapping v1 `attrs.src` → external reference и mapping согласованного `{ type: 'external' | 'asset' }` source contract без изменения legacy JSON/Y.Doc или генерации node IDs.
- [ ] 2.4 Валидировать external URL локально по v1 policy HTTPS без credentials; отклонять unsafe/неподдерживаемые схемы и не выполнять сетевые запросы.

## 3. Unit coverage и завершение change

- [ ] 3.1 Добавить unit fixtures на реальных Yjs documents текущей editor schema: пустой и текстовый документ, несколько параграфов, formatting, вложенные nodes, media и отсутствие media.
- [ ] 3.2 Проверить external image, будущий asset mapping fixture, повторные одинаковые источники с разными nodeId, missing nodeId, unsafe URL, malformed Yjs bytes, неизвестную schema version и unsupported node.
- [ ] 3.3 Проверить детерминизм одинаковых captured bytes и то, что правки исходного live Y.Doc после capture не меняют projection результата; все unit tests выполнять без PostgreSQL, Hocuspocus и сети.
- [ ] 3.4 Выполнить API/web/package lint, typecheck и unit tests, затем `openspec validate add-document-projection --strict`; сохранить change неархивированным до human review реализации.
