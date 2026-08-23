## Context

См. `proposal.md` для мотивации. Текущая `main` уже содержит утверждённую `docs/database-schema.md`, а материалы MVP находятся только в открытом PR #22 и опираются на более раннюю архитектуру. Ветка `docs/plan` создана от актуальной `main`; активных OpenSpec changes до начала этой работы не было.

Изменение затрагивает документацию, root tooling для генерации PNG и внешний GitHub backlog. Оно не реализует описанные продуктовые подсистемы и не меняет API, базу данных, авторизацию или realtime-протоколы.

## Goals / Non-Goals

**Goals:**

- Сформировать единый schema-driven roadmap с вертикальными этапами «данные → backend/realtime → web».
- Включить все спроектированные подсистемы, кроме самостоятельных задач.
- Сделать текстовые и PNG-макеты согласованными с этапами roadmap и воспроизводимыми из репозитория.
- Создать новый, независимо адресуемый backlog без переписывания исторических issues.
- Сохранить связь с исходными материалами PR #22 и активной backend-работой PR #37.

**Non-Goals:**

- Не определять точные REST payloads, URL прикладных API или формат realtime events сверх уже зафиксированного в схеме имени room `page:<page_id>`.
- Не реализовывать Prisma-модели, миграции, NestJS/Next.js/Hocuspocus-код или object storage.
- Не обновлять PR #37, даже если roadmap отмечает необходимость согласовать его модели со схемой.
- Не редактировать и не закрывать PR #22 или существующие issues.
- Не добавлять самостоятельные `TASK`, comments, calendar events, notifications, invitations, audit log или AI history.

## Decisions

### 1. Новый PR от `main`, а не продолжение PR #22

Работа продолжается в существующей ветке `docs/plan`. Из `origin/docs/mvp-plan` переносятся только итоговые файлы `docs/mvp-plan.md`, `docs/mvp-screens.md` и `docs/screens/*`; README редактируется поверх актуальной версии из `main`.

Такой перенос исключает устаревшие изменения README и конфликтную историю старой ветки. Новый PR укажет PR #22 и автора исходных материалов, но не будет закрывать старый PR.

Альтернатива — rebase или cherry-pick всех пяти коммитов PR #22 — отклонена из-за лишних конфликтов и сохранения уже неверных промежуточных решений.

### 2. Roadmap состоит из девяти этапов

`docs/mvp-plan.md` описывает:

0. инженерный фундамент;
1. identity: `USERS`, `USER_PROFILES`, `SESSIONS`, `REFRESH_TOKENS`;
2. страницы: hierarchy, fractional position и soft delete;
3. `PAGE_PERMISSIONS` и effective access `viewer/editor`;
4. TipTap/Yjs/Hocuspocus, `PAGE_DOCUMENTS`, persistence, presence и read-only connections;
5. assets, object storage, avatars, covers и `PAGE_ASSETS` projection;
6. `DOCUMENT_SNAPSHOTS`, история и restore;
7. `PAGE_SEARCH_DOCUMENTS` и permission-safe search;
8. publication snapshots/renderings, `PAGE_PUBLICATIONS` и public route `/p/:slug`.

Этапы 5–7 могут реализовываться параллельно после collaboration foundation. Publication зависит от актуального Y.Doc, snapshots/renderings и assets для корректного публичного media rendering.

Backend identity/session не получает новую issue: roadmap ссылается на активный PR #37 и отдельно фиксирует, что его текущие Prisma-модели должны быть согласованы с `docs/database-schema.md` до merge.

### 3. Создаётся только новый backlog

Сначала создаётся meta issue `Документация: актуализировать roadmap MVP по утверждённой схеме БД`, затем в топологическом порядке создаются следующие issues:

1. `Web: реализовать регистрацию, вход и профиль пользователя`.
2. `Backend: реализовать иерархию, порядок и soft delete страниц`.
3. `Web: реализовать рабочую область, дерево и действия страниц`.
4. `Backend: реализовать effective permissions страниц`.
5. `Web: реализовать управление доступом viewer/editor`.
6. `Collaboration: развернуть Hocuspocus и persistence Yjs-документов`.
7. `Web: реализовать TipTap/Yjs редактор, presence и read-only режим`.
8. `Backend: реализовать assets, object storage и PAGE_ASSETS projection`.
9. `Web: реализовать аватары, обложки и media nodes`.
10. `Backend: реализовать snapshots и восстановление документов`.
11. `Web: реализовать историю версий и восстановление`.
12. `Backend: реализовать search projection и permission-safe search API`.
13. `Web: реализовать полнотекстовый поиск страниц`.
14. `Backend: реализовать атомарный publish pipeline и renderings`.
15. `Web: реализовать управление публикацией и публичный SSR route`.

Каждая issue создаётся на русском языке с разделами Goal, Context, Requirements, Dependencies, Out of scope и Acceptance criteria. В неё добавляются ссылки на соответствующие разделы схемы и уже созданные dependency issues. Labels, milestone, assignee и Project membership не назначаются: репозиторий не задаёт для них проверяемой конвенции.

Старые issues не используются в новом roadmap и остаются без внешних изменений. Фактические URL новых issues вставляются в документы после создания.

### 4. Макеты соответствуют этапам, а tasks удаляются

`docs/mvp-screens.md` и HTML/CSS-генератор содержат девять согласованных макетов:

- `01-auth.png`;
- `02-workspace.png`;
- `03-permissions.png`;
- `04-collaboration.png`;
- `05-assets.png`;
- `06-history.png`;
- `07-search.png`;
- `08-publication.png`;
- `09-public-page.png`.

Старые `04-tasks.png`, `05-task-form.png` и соответствующий код удаляются. Старый guest-макет заменяется новым `09-public-page.png`, который показывает immutable опубликованную версию без editor runtime.

Каждый раздел содержит PNG, краткое описание поведения и эквивалентную текстовую схему. Макеты показывают продуктовые границы, но не вводят точные API-контракты.

### 5. Генератор становится штатным root tooling

В root `package.json` добавляются direct devDependency `puppeteer-core` и команда:

```text
pnpm docs:screens
```

Версия фиксируется обычным pnpm lockfile и не выносится в catalog, поскольку зависимость используется только root workspace.

`docs/screens/generate.js` переводится на ESM. При запуске явно заданный `PUPPETEER_EXECUTABLE_PATH` имеет приоритет; иначе Puppeteer запускает установленный stable Chrome через channel `chrome`. Генератор создаёт все девять PNG размером 1440 × 900 CSS pixels с `deviceScaleFactor: 2`.

Полный `puppeteer` с загрузкой браузера отклонён как более тяжёлая зависимость. Разовая инструкция `npm install puppeteer` отклонена как невоспроизводимая и нарушающая dependency policy.

### 6. Внешние операции выполняются только после review

Создание issues, push и открытие PR требуют авторизованного GitHub CLI или подключённого GitHub app. До подтверждения planning artifacts внешние записи не выполняются. Если авторизованного инструмента нет, работа останавливается перед первой GitHub-записью без попытки извлечь или вывести сохранённые credentials.

Новый PR:

- закрывает только новую meta issue;
- ссылается на PR #22 как источник исходных материалов;
- явно сообщает, что PR #22 и старые issues оставлены без изменений;
- включает OpenSpec artifacts, документы, изображения, tooling и lockfile.

## Risks / Trade-offs

- [Старый и новый backlog одновременно остаются открытыми] → Новый roadmap ссылается только на новый набор issues и прямо называет его актуальным; старые сущности не упоминаются как зависимости.
- [PR #37 использует модели, не совпадающие со схемой] → Этап identity ссылается на PR #37, но явно блокирует последующие schema-dependent этапы до согласования моделей; текущий change PR #37 не изменяет.
- [PNG может незначительно отличаться между версиями Chrome и платформами] → Проверять семантику и размеры визуально; не вводить byte-for-byte CI check для изображений.
- [На машине нет stable Chrome] → Поддержать `PUPPETEER_EXECUTABLE_PATH` и документировать понятную ошибку запуска.
- [Создание 16 GitHub issues — внешняя операция] → Выполнять после human review, в dependency-порядке, проверяя результат каждого вызова и не создавая дубликат повторно.
- [Roadmap может восприниматься как уже реализованный контракт] → В каждом этапе разделять текущий foundation, активную работу и будущие issues; не описывать незаведённые endpoint shapes как утверждённые.

## Migration Plan

1. Получить human review proposal, design и tasks.
2. Создать новый GitHub backlog и сохранить выданные URL.
3. Перенести исходные материалы PR #22 в `docs/plan` и переписать их под новый roadmap.
4. Обновить генератор, dependency manifest, lockfile, README и PNG.
5. Выполнить OpenSpec и repository checks, затем открыть новый PR.
6. После human review реализации архивировать `mvp-roadmap` в том же PR и получить финальное approval.

Rollback репозиторных изменений выполняется обычным revert нового PR. Если работа отменена до merge, созданные новые issues закрываются с комментарием о причине; PR #22 и старые issues остаются нетронутыми.
