## Why

До реализации редактора необходимо зафиксировать устойчивые границы document model, editor UI и transport lifecycle. Иначе временный REST bridge проникнет в widget, TipTap-конфигурация станет неявным persisted contract, а последующий переход на Hocuspocus потребует переписывать editor core и создаст риск потери данных.

## What Changes

- Спроектировать schema version 1 как долгоживущий persisted contract страницы: единственным редактируемым источником истины остаётся `Y.Doc`, а каждый custom node/mark получает стабильный JSON contract, валидацию и детерминированное представление вне React NodeView.
- Разделить FSD-ответственности между document entity, page-editing feature и композиционным `PageEditor` widget; transport/session lifecycle не должен принадлежать TipTap surface.
- Ввести transport-neutral document session abstraction, чтобы временный REST adapter и будущий Hocuspocus adapter предоставляли editor surface один и тот же `Y.Doc`, статусы, editable-state и typed errors.
- Спроектировать временный REST session с single-flight autosave, защитой от stale callbacks, явным cleanup lifecycle, проверкой payload до PUT и блокирующим состоянием `document-too-large`.
- Зафиксировать честные гарантии сохранения: flush при SPA navigation является best effort, а закрытие вкладки защищается `beforeunload` warning и не считается гарантированным persistence mechanism.
- Не выпускать REST editing lifecycle пользователям: до Hocuspocus активная страница сохраняет существующий placeholder. REST adapter проверяется изолированно и не импортируется production workspace.
- Добавить keyboard alternative для перестановки блоков и security contract для ссылок, внешних изображений, direct video и YouTube embeds.
- Подготовить schema v1 к будущему publication pipeline `Y.Doc → derived TipTap JSON → static renderer → deterministic output`; public page и создание immutable snapshots остаются вне этого change.
- Оставить realtime collaboration, presence, effective permissions и production Hocuspocus integration в issue #46. При их реализации REST autosave editable document должен быть удалён, а schema и editor surface сохранены.

Этот PR изменяет только OpenSpec planning artifacts. Dependencies, editor, API adapters, workspace integration и иные production-файлы в нём не изменяются.

## Capabilities

### New Capabilities

- `web-page-editor`: Контракт schema v1, transport-neutral editor session, доступное редактирование, безопасные external media и ограниченный временный REST lifecycle без production-подключения.

### Modified Capabilities

Нет. Поведение `web-page-workspace` в этом change не меняется: placeholder остаётся до отдельного reviewed Hocuspocus change.

## Impact

- Frontend после отдельного implementation review: `entities/page-document` владеет persisted schema и Yjs helpers; `features/page-editing` — session lifecycle и editor surface; `widgets/page-editor` — композицией и статусами.
- Dependencies после отдельного implementation review: согласованный набор TipTap 3/Yjs extensions только в `@lite-notion/web`; Hocuspocus packages не добавляются этим change.
- Backend/API: endpoints, DTO, database schema и generated API не меняются. Существующий document API рассматривается только как ограниченный bridge для изолированного adapter.
- Publication: будущие immutable snapshots используют derived TipTap JSON для static rendering; editable document не получает authoritative JSON-копию.
- Infrastructure/deployment: REST editor не подключается ни к одному production route. Для его будущего пользовательского выпуска потребуется новое reviewed решение с single-writer protection либо Hocuspocus.
- Текущий PR: только `proposal.md`, `design.md`, delta spec и `tasks.md`; production changes запрещены.
