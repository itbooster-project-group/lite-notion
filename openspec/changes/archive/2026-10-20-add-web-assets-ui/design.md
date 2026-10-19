## Context

Текущие ограничения и backend-контракт описаны в [proposal.md](proposal.md), поведение — в delta-specs этого change. Backend #47 уже предоставляет приватный asset API и проверки прав. В текущих API DTO не передаются выбранные `avatarAssetId` и `coverAssetId`, хотя ссылки существуют в модели данных; для восстановления UI после reload достаточно добавить nullable поля в существующие ответы. В frontend уже используются Feature Sliced Design, TanStack Query, общий auth/refresh слой, TipTap schema v2 и Y.Doc как единственный изменяемый источник содержимого страницы.

## Goals / Non-Goals

**Goals:**
- Подключить новые UI сценарии к API #47 без дублирования endpoint, auth и permission логики.
- Сохранять в profile/page/document только устойчивые asset IDs; signed URL и upload progress оставлять временным presentation state.
- Обеспечить единый SSR-compatible слой отображения, который не зависит от редактора.
- Сделать поведение восстановления и отказа явным для reload, reconnect, истёкшего access token и потери разрешений.

**Non-Goals:**
- Публичный renderer, API или публикационные данные #53.
- Новый backend storage lifecycle, таблицы, миграции или изменение projection #47.
- Галереи, video/audio, общий media manager или универсальный upload framework.

## Decisions

### 1. Существующие API операции и DTO остаются единственным серверным контрактом

Frontend использует существующий сгенерированный API для `POST /assets/uploads`, `PUT /assets/:assetId/content`, page-context metadata/read URL, `DELETE /assets/:assetId`, page grant, cover assignment и avatar assignment/read URL. `POST /assets/uploads` возвращает `assetId` и `contentPath`, а при переданном `pageId` backend уже создаёт grant. Успешный `PUT /assets/:assetId/content` возвращает asset metadata со статусом `ready`; `GET /assets/:assetId?pageId=...` и read URL работают только для готового asset в разрешённом контексте. Эти endpoints не дают frontend достоверно различать `pending`, `failed`, `deleted` и отсутствие доступа во всех контекстах. Сгенерированные операции реэкспортируются через публичный `shared/api` entry point и подключаются к существующему MSW setup. В backend #47 добавляются только nullable `avatarAssetId` в `UserProfileDto` и nullable `coverAssetId` в `PageDto`; соответствующие query/mapper включают уже существующие поля. Затем обновляются OpenAPI artifact и generated web client. Новых route, DB поля и миграций нет.

Это позволяет после reload восстановить выбранную сущность без signed URL. Альтернатива — получить ID отдельными вызовами или кэшировать их в браузере — создаёт рассинхронизацию с серверной ссылкой и не нужна при наличии полей в модели.

### 2. Upload transport добавляет прогресс на общей API границе

`fetch` текущего `apiFetch` не предоставляет upload progress. Добавляется узкий raw binary transport в `shared/api`, который использует XHR для запроса content endpoint, получает access token и refresh через публичный существующий auth-session API, включает credentials и повторяет исходный запрос не более одного раза после 401. Повтор использует тот же PUT, `assetId` и `Blob`; `POST /assets/uploads` при этом повторно не вызывается. Если refresh не удался или повторный запрос снова отклонён, операция завершается. 403 не повторяется; ошибки аутентификации и permission denial не классифицируются как временные network errors. Backend перед записью каждого валидного content attempt conditionally claims новый уникальный attempt key; при уже завершённой/заменённой попытке возвращает 409. 409 не подтверждает ready и не запускает цикл повторов. Явный retry после retryable network/storage error использует тот же `assetId` и `Blob`; пока backend asset pending он conditionally claims очередной уникальный attempt key, а если предыдущая попытка уже завершила asset, вернёт 409. После 409 клиент прекращает retry; существующий authorized page metadata может подтвердить ready для page-context upload, но не подтверждает неготовый/недоступный status, а для avatar status lookup отсутствует. Успешный PUT response — непосредственное подтверждение ready. На сетевом сбое после отправки bytes результат неоднозначен: сервер мог завершить PUT, а ответ потеряться. UI не вставляет node и не утверждает успех по одному факту отправки. Для page upload можно запросить существующий page-context metadata endpoint после неоднозначного результата; он подтверждает только ready и не различает остальные причины недоступности. Для avatar отдельного status lookup нет, поэтому автоматический повтор новой сущности не выполняется; пользователь получает явный неопределённый результат и может начать новую операцию осознанно. Существующая логика refresh остаётся единственной, включая single-flight для параллельных запросов. JSON операции и server-state остаются на generated client и TanStack Query.

Upload state — локальное состояние пользовательской операции, не долговременное серверное состояние: progress и локальное pending исчезают при reload. Успешный content PUT фиксирует ready; failure ответа не позволяет frontend вывести точный asset status. Валидационная ошибка на первоначальном initiation key может перевести backend asset в failed; последующие попытки уже используют иной ключ и имеют отдельные условия. Frontend не моделирует достоверные `failed`/`deleted` статусы на основании общего 401/409. Metadata/read URL denial или неразличимая недоступность показывается как unavailable. После reload незавершённая операция не восстанавливается автоматически: пользователь выбирает файл заново. Повторный клик блокируется только на время активной клиентской операции.

### 3. Разделить транспорт/запросы, доменную идентичность и presentation в рамках FSD

- `shared/api`: generated операции, их публичные экспорты, raw XHR upload transport и общие API типы; transport не принимает решений об avatar, cover или editor.
- `entities/asset` (либо ближайшая существующая entity-конвенция): небольшой resolver hook/container для metadata/read URL, authorization-scoped query keys и безопасных loading/ready/unavailable view data. Key включает asset ID, контекст (`pageId` либо avatar user ID) и текущего authenticated user ID. Query cache хранит временный URL не дольше `expiresInSeconds` за вычетом запаса до истечения. При logout, session expiry или смене пользователя auth lifecycle удаляет authorization-sensitive asset queries; подтверждённая потеря доступа очищает соответствующий query data.
- `shared/ui` (либо минимально подходящее текущее место): чистый `AssetImage` presentation, принимающий готовые `src`, `alt`, состояние и fallback. Он не выполняет запросов и не зависит от auth-session, TanStack Query, TipTap, Yjs или browser-only editor runtime.
- `features/profile-avatar` и `features/page-cover`: операции загрузки/назначения/снятия и локальные состояния; UI вызывает текущие API mutation hooks.
- `features/page-editing`: upload command и NodeView для editor-specific controls, не владеющие API endpoint логикой.

Не вводится новый global state library и не создаётся generic upload framework. Для сохранения FSD imports публичны на границах slices.

### 4. Разрешение URL отделено от AssetImage presentation

`AssetImage` — чистый SSR-compatible presentation-компонент, принимающий готовые `src`, `alt`, визуальное состояние и fallback; API-запросов и авторизации внутри него нет. Отдельный небольшой resolver hook/container использует существующий asset API, TanStack Query и auth-session, затем передаёт готовые данные в `AssetImage`. Resolver query key включает asset ID и authorization context, а URL считается stale с запасом до `expiresInSeconds`. Ошибка загрузки изображения инвалидирует конкретный URL query и допускает один refresh; повторная ошибка показывает unavailable fallback без бесконечного refetch. 401/403 очищает URL и не повторяется как временная ошибка. Сетевые и server errors можно ограниченно повторить по существующей query policy, не превращая это в общий polling механизм. При logout/session expiry или смене пользователя удаляются все asset URL query данных предыдущего auth context. Ранее выданный signed URL может оставаться действительным до TTL; немедленный отзыв не обещается.

Editor-specific NodeView использует соответствующий resolver и общий presentation; только NodeView отвечает за selection, controls и editable state. Для server/static rendering используются уже принятые средства проекта, включая `@tiptap/static-renderer`, с `AssetImage` и готовым `src` или fallback. Запрет касается интерактивного редактора, NodeView runtime, Yjs и Hocuspocus; новый собственный static renderer не создаётся. Авторизованный client resolver для статической отрисовки не подключается. Существующая статика для legacy external images сохраняется. Такой presentation boundary допускает повторное использование в будущем #53, не реализуя его renderer.

### 5. Y.Doc содержит source identity, а не URL

Asset upload и готовность должны быть подтверждены до команды insert. Новый asset для конкретной страницы инициируется с `pageId`: backend #47 проверяет page edit permission и транзакционно создаёт `PageAssetGrant`, поэтому повторный grant вызов для этого page context не делается. Для уже существующего ready asset, который uploader повторно использует на другой странице, frontend выполняет существующий grant endpoint как необходимую операцию target page; backend делает idempotent upsert и проверяет uploader и target page editor permission. Другие editors могут использовать такой asset только при уже имеющемся grant; frontend не может выдать grant от имени uploader-а. Клиент не ведёт собственный реестр grants и не вызывает grant повторно для той же новой загрузки. В обоих случаях необходимый grant и подтверждённый ready статус должны быть получены до записи image node; отказ не меняет Y.Doc. Для avatar upload page context не передаётся.

Перед insertion пользователь выбирает accessibility атрибуты в компактной форме, встроенной в текущий image upload flow: по умолчанию `decorative=false`, тогда требуется непустое текстовое описание `alt`; явный checkbox «Декоративное изображение» устанавливает `decorative=true` и пустой `alt`. Клиент не выбирает декоративность автоматически и не вставляет node при несовместимой паре. В одном успешном действии после подтверждения upload/grant один раз создаётся стабильный `nodeId` и вставляется существующая schema v2 форма: `nodeId`, `source: { type: 'asset', assetId }`, `alt`, `decorative`; `src` не содержит signed URL. Не меняются schema version, legacy external `src` поведение, backend normalization или projection #97.

Node ID и asset ID остаются стабильными при render/reconnect. Idempotency UI guard закрывает double-click, а Yjs sync распространяет единственную запись. URL query refresh и image load error обрабатываются вне Y.Doc transaction. При reconnect editor использует синхронизированный node и разрешает URL заново, не вставляя его повторно.

### 6. Avatar, cover и участники используют отдельные контексты чтения

Профиль использует собственный avatar selection endpoint и текущий `avatarAssetId`; participants показывают аватар через существующий authenticated avatar-read route. При смене avatar ID текущего пользователя presence обновляет только Awareness state. Это не создаёт Y.Doc update. В page workspace cover metadata и read URL запрашиваются с `pageId`; изменяющие controls доступны только при backend-provided `accessRole` owner/editor. Viewer получает presentation, но не мутации. Backend остаётся финальной authorization boundary, поэтому 401/403 прекращает действие, инвалидирует релевантный query и обновляет workspace/session permission state. Asset read denial не делает всю страницу read-only: редактор с актуальным edit permission сохраняет операции над image node, включая удаление недоступного node; backend отказ в праве редактировать страницу по-прежнему запрещает любые content mutations. Ошибка чтения не изменяет Y.Doc и не удаляет node автоматически.

Снятие/замена ссылки не вызывает автоматический delete старого asset: он может использоваться в другом месте. Удаление unattached нового asset допускается только как best-effort cleanup, если не было успешного attach; ошибки cleanup не показываются как успешное физическое удаление.

### 7. Восстановление и недоступный asset имеют безопасное поведение

После reload profile/page DTO и Y.Doc восстанавливают asset ID; resolver query получает новый URL. До TTL истечения URL refresh запускается с небольшим запасом; image load error допускает только один принудительный refresh на конкретную ошибку. Повторная ошибка показывает fallback и не запускает бесконечные запросы. Сетевые/5xx сбои разрешаются ограниченным retry; 401/403 не классифицируются как transient и не повторяются автоматически. Signed URL нигде не сохраняется как постоянная identity или в Y.Doc.

Projection #97 выполняется после сохранения Y.Doc; persistence use-case ожидает projection, но projection failure не откатывает принятый document state. Диагностика сохраняет attempted revision, retryAfter и error code; общее ограничение — пять попыток на revision, включая синхронный вызов при persistence. Scheduler запускается каждые 15 секунд, выбирает stale revision с оставшимися попытками и применяет существующую возрастающую задержку. Page-context read URL требует для viewer готовой текущей `PAGE_ASSETS` reference. До обновления projection viewer может получить 401; текущий API не отличает такой projection lag от настоящего permission/reference denial (включая stale projection с существующей ссылкой). Поэтому клиент fail closed и не повторяет 401/403 как временную ошибку. После convergence последующее открытие/re-entry или новое штатное разрешение может запросить URL снова. Сетевые ошибки и 5xx — подтверждённые временные ошибки и допускают ограниченный retry; auth/permission denial не является network error. Не добавляется новый polling или механизм синхронизации.

Потеря page permission запрещает content mutation согласно текущему backend authorization. Одно лишь отсутствие read URL или недоступность asset не ограничивает editability страницы и не мешает authorized editor удалить node. Ошибка чтения не меняет Y.Doc. Ранее выданный signed URL может оставаться пригодным до TTL; немедленный отзыв URL не обещается этим change.

### 8. Тестировать границы API, редактора и collaboration существующими средствами

Vitest/RTL покрывают XHR progress, тот же assetId/Blob при единственном 401-refresh retry, отказ от трактовки 409 как успеха, неоднозначный сетевой результат, отсутствие автоматического нового initiate, single-flight refresh, query key authorization context/invalidation на logout и смене пользователя, URL TTL safety margin, один image-error refresh, 401/403 без retry, double-click guard, avatar fallback/replace/remove, cover permission states, participant avatar update без Y.Doc transaction, pure AssetImage props/SSR boundary, asset node source/alt/decorative и стабильный nodeId, а также legacy external images. Для asset nodes проверяются оба допустимых сочетания `alt`/`decorative` и недопустимые сочетания. MSW должен обрабатывать все новые generated API вызовы; неиспользуемые/ошибочные запросы не маскируются.

Collaboration E2E расширяет имеющийся opt-in page editor harness: два пользователя, upload и insert готового asset, синхронизация стабильного node, отсутствие controls у viewer, remove sync, reload/reconnect без duplicate node. Projection integration scenario добавляется в существующий PostgreSQL integration suite `page-document-provenance.integration-spec.ts`, используя реальный `ProjectionRetryScheduler`/`ProjectPageAssetsUseCase`; scheduler вызывается напрямую из теста, без ожидания реального интервала и без отдельного harness. Сценарий проверяет, что Y.Doc уже принят, projection ещё не совпадает по revision, viewer read URL fail closed, scheduler успешно обновляет projection, а последующий read авторизуется. Frontend test подтверждает, что 401/403 не retry-ятся автоматически; это необходимо, поскольку текущий endpoint не отличает lag от настоящей потери доступа. Отдельный test проверяет, что временный network/5xx error допускает ограниченные retry. Реальный S3 Selectel smoke test может быть выполнен в настроенном тестовом окружении перед production deployment, но его наличие в CI/workflow не считается свидетельством успешного запуска. E2E требует существующих test accounts/page и доступного API/storage окружения.

## Risks / Trade-offs

- [Signed URL истёк во время отображения] → Ограниченное обновление URL по сроку/ошибке; стабильный ID остаётся единственным источником identity.
- [Backend permission изменена между загрузкой и attach] → Все операции повторно авторизуются backend; при 403 Y.Doc не изменяется или оптимистическое состояние откатывается.
- [XHR и refresh ведут себя иначе, чем fetch] → Тонкий transport использует существующий refresh API; unit-тесты проверяют credentials, retry limit, Blob replay и параллельный refresh.
- [Asset загружен, но пользователь не завершил attach] → UI сообщает ошибку/позволяет повторить разрешённую операцию; не удаляет asset, пока результат attach неоднозначен. Backend TTL и reconciliation остаются cleanup safety net.
- [Публичный DTO меняется аддитивно] → Поля nullable, OpenAPI и generated client обновляются вместе; клиентов, полагающихся на точное отсутствие полей, не предполагается.
- [URL нельзя немедленно отозвать после permission loss] → Новые запросы fail closed; ранее выданная короткоживущая ссылка остаётся действительной до expiry в рамках backend #47.

## Migration Plan

1. Добавить nullable ID в существующие DTO/мапперы, обновить OpenAPI и generated client; схема БД и миграции не меняются.
2. Добавить общий API/query/presentation слой и покрывающие его unit/RTL тесты.
3. Подключить profile avatar, page cover и presence UI с permission/error сценариями.
4. Расширить editor asset source/NodeView и static presentation с тестами legacy schema и projection-compatible payload.
5. Добавить collaboration E2E и выполнить локальные проверки; проверить OpenAPI/generated client diff.

Rollback — обычный rollback web/API кода: новые поля additive/nullable и не требуют data migration. Клиент после rollback продолжит прежнее поведение без новых image UI сценариев; уже созданные assets и references остаются управляемыми существующими backend #47.

## Open Questions

Нет вопросов, меняющих согласованные требования или подход. Реальные S3 smoke credentials и test accounts определяются окружением CI/deployment и не являются частью этого OpenSpec.
