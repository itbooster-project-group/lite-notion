## 1. Сверка API и подготовка Web contract

- [x] 1.1 Сверить generated publication endpoints/DTO с текущим `apps/api/openapi.json`; экспортировать используемые management/publication functions, hooks и DTO через `apps/web/src/shared/api/index.ts`, не дублируя типы вручную.
- [x] 1.2 Зафиксировать обработку точного `404 publication_not_found`, других 404, 401/403, 400 validation и 409 slug/state/asset errors; обновить generated MSW handlers/fixtures только через существующую `pnpm api:generate`, если контракт действительно менялся.
- [x] 1.3 Проверить request/response и повторяемость GET, Publish, Republish, PATCH metadata, Unpublish, public read и asset resolver; подтверждено: SEO первого Publish можно сохранить текущим PATCH-created draft до POST без backend/OpenAPI/schema изменения.

**Зависимости:** нет.

**Готово, когда:** generated API является единственным источником DTO, оба вида 404 тестируются отдельно, подтверждён безопасный двухшаговый первый Publish.

## 2. Publication management feature и UI

- [x] 2.1 Добавить компактное route-specific publication management в `pages/workspace/ui` и orchestration hook в `pages/workspace/model`, так как composition имеет одного потребителя; получать статус только для `canManagePage`, использовать существующие PageCapabilities, generated API, TanStack Query, React Hook Form/Zod и shadcn wrappers.
- [x] 2.2 Реализовать `not published`/draft, `published`, `unpublished`, pending/error/uncertain отображение, первый Publish через PATCH draft → POST publish, явный Republish, отдельный metadata PATCH, Unpublish confirmation и URL open/copy из publicPath + browser Web origin.
- [x] 2.3 Обеспечить pending guard, доступные labels/focus/keyboard interactions, field errors для slug/SEO, retry только после сверки состояния, query update/invalidation и сохранение editor/input при permission/network failures. Для неизвестного результата перечитывать status один раз; прежний status не считать доказательством отказа.
- [x] 2.4 Добавить RTL tests для первого publish/draft partial success, backend status/DTO, retry и Unpublish, metadata-only slug/SEO, conflicts, validation, permission denial, pending/error states, URL copy и неопределённых результатов. Проверить Publish timeout после commit, timeout до подтверждения, Unpublish подтверждение через GET, Republish confirmation только по изменившемуся backend `publishedAt` и uncertain state при прежнем timestamp, отсутствие автоматического retry, metadata GET reconciliation и query invalidation; не выводить unpublished changes indicator без backend signal.
- [x] 2.5 Изолировать локальное состояние management по `pageId` через keyed composition; добавить RTL tests навигации A→B с сохранённой publication/feedback и незавершённым mutation, убедиться, что поздний ответ A не меняет UI B и query key остаётся page-specific.

**Зависимости:** этап 1.

**Готово, когда:** все mutation states следуют ответам backend, draft никогда не выглядит публичным, ошибки не закрывают редактор, viewer не получает controls.

## 3. Schema-safe static presentation

- [x] 3.1 Проверить транзитивные imports существующей schema, normalizers и static renderer; оставить базовую schema-композицию static-safe в public API `entities/page-document`, а Collaboration/Yjs editor extension composition держать в `features/page-editing` без переписывания `renderPageDocumentToHTML`.
- [x] 3.2 Использовать public `entities/page-document` API и React static-rendering mapping на уже установленном `@tiptap/static-renderer/pm/react`; переиспользовать существующие mappings/normalizers и presentation из #49, без NodeViews, HTML string injection или собственного renderer framework.
- [x] 3.3 Реализовать безопасную нормализацию JSON для supported nodes/marks, fallback неизвестных/invalid nodes и отказ от rendering неподдерживаемой schema version.
- [x] 3.4 Добавить unit tests для schema-v2 nodes/marks, image/cover/media, legacy external media, URL sanitization, unsupported nodes/version и React Server Component rendering.

**Зависимости:** этап 1; renderer не должен блокировать API/UI.

**Готово, когда:** public rendering не импортирует editor runtime, отображает текущую schema v2 и получает regression coverage на unsupported inputs.

## 4. Public SSR route и SEO

- [x] 4.1 Добавить `/p/[slug]` в отдельную public route group и `pages/publication` composition без `PrivateRoute`, workspace shell, client query или editor; использовать native server fetch с `cache: 'no-store'`, только Accept header и явным отсутствием Authorization/Cookie forwarding/credentials.
- [x] 4.2 Использовать generated DTO через type-only import без generated endpoint module/React Query; валидировать только SSR-required fields, supported schemaVersion и exact resolver contract, не создавать вручную DTO или копию полного контракта.
- [x] 4.3 Подключить единый per-request loader для `generateMetadata` и body: backend 404 и incomplete/invalid 200 DTO → safe not-found и нейтральная metadata; network/5xx → общий error response, не 404; canonical не строить без configured frontend site origin.
- [x] 4.4 Добавить SSR/unit tests анонимного GET (нет Authorization/Cookie), generated DTO types, immutable live-vs-public behavior, согласованного `generateMetadata`/body для valid/404/invalid DTO/network/5xx, отсутствия private API и отсутствия editor/React Query runtime в public dependency boundary.

**Зависимости:** этап 3.

**Готово, когда:** anonymous request получает серверный HTML только из public API, metadata snapshot-consistent, private/live routes не используются.

## 5. Изображения, cover и public response policy

- [x] 5.1 Сопоставить media `source.assetId` только с public DTO `assets`, а cover — только с DTO `cover`; валидировать resolverPath как точный endpoint `/api/v1/public/publications/:slug/assets/:assetId` без query/hash и строить абсолютный URL от configured API origin, игнорируя request Host/Forwarded.
- [x] 5.2 Использовать snapshot-safe image/cover presentation. Для descriptor, отсутствующего до SSR, отдать server placeholder; для resolver 404 после HTML использовать минимальный изолированный Client Component с `onError` fallback, без editor/collaboration import; сохранить legacy safe HTTPS media и dimensions/alt/decorative metadata.
- [x] 5.3 Применить `/p/:slug` dynamic/no-store headers и scoped CSP: включить configured API origin в `img-src` только если он не покрыт текущей HTTPS policy, оставить конечный HTTPS storage origin разрешённым и не расширять `connect-src` для server-side fetch.
- [x] 5.4 Добавить unit/RTL tests для двух разных asset failure phases, post-HTML client fallback, snapshot cover, live asset удалён из документа, wrong slug/asset/path/query resolver cases, API/Web different origins и CSP.
- [ ] 5.5 В deployment smoke test проследовать реальный 302 resolver → signed storage URL и подтвердить загрузку image под production CSP.

**Зависимости:** этап 4.

**Готово, когда:** public media работают без private asset API/storage keys/signed URLs в JSON, а только active published DTO определяет доступ.

## 6. Dynamic no-store SSR и backend outbox ACK

- [x] 6.1 Сохранить `POST /api/internal/revalidate` только как минимальный authenticated outbox receipt: проверить server-only bearer token, eventId и список `/p/:slug`, отвечать 204; не вызывать `revalidatePath`, не хранить state и не добавлять очередь.
- [x] 6.2 Зафиксировать, что backend scheduler при отсутствующих URL/token не claim-ит события и pending rows растут; при configured endpoint повторы после lease expiry/lost ACK безопасно получают 204. Подтвердить, что backend хранит delivered rows без retention cleanup; не заявлять bounded total outbox и не добавлять backend schema/cleanup в Web scope.
- [x] 6.3 Документировать `PUBLICATION_REVALIDATION_TOKEN` как private Web/API secret и API endpoint URL; обновить нужные env examples и CI test env без production secrets. Зафиксировать no-store freshness при delayed/disabled delivery и 60-second signed URL limit.
- [x] 6.4 Добавить unit tests валидного/повторного receipt, old/new slug paths, invalid auth/path/payload/config и no-store freshness без `revalidatePath`.
- [ ] 6.5 При релизной проверке подтвердить production delivery configuration и поведение pending backlog при отключённой доставке.

**Зависимости:** route из этапа 4; может выполняться параллельно с этапом 5.

**Готово, когда:** текущий backend outbox может безопасно отправить event в Next, duplicate не меняет содержимое назад, SSR fresh даже при выключенном outbox.

## 7. E2E, документация и repository checks

- [x] 7.1 Расширить существующий Playwright harness сценарием publish snapshot A → anonymous open → live edit B и подтверждение записи B в Yjs state через existing internal document read → anonymous open до Republish всё ещё показывает A → republish показывает B → slug change/old path 404 → unpublish/404 → republish after unpublish. Internal service token используется только Node test runner; fixture-dependent SEO, permission-denied и conflict cases остаются частью исполнения сценария в настроенном окружении.
- [ ] 7.2 Запустить end-to-end сценарий на disposable page с настроенными credentials; проверить SEO, permission-denied и conflict cases, где это позволяет fixture.
- [x] 7.3 Проверить snapshot asset/image/cover rendering и прежнюю доступность активных SnapshotAsset после изменений live document существующими API integration tests либо уже доступным API/storage fixture; не добавлять второй test framework. `pnpm --filter @lite-notion/api exec vitest run --config vitest.integration.config.mts src/publications/publications-read.integration-spec.ts` прошёл на локальной PostgreSQL.
- [x] 7.4 Использовать узкую source-boundary проверку и production build/dependency trace существующими средствами: public route не должен тянуть `@tiptap/react`, generated React Query endpoint module, Hocuspocus, Yjs, Awareness или Collaboration; не создавать отдельный dependency-trace framework.
- [x] 7.5 Обновить README/env/E2E инструкции по publication fixture, разнесённым Web/API origins и outbox receipt secret; проверить OpenAPI/generated client drift, docs и отсутствие лишних зависимостей/миграций.
- [x] 7.6 Выполнить и успешно проверить `pnpm exec openspec validate add-web-publications --strict`, Web unit/RTL tests, publication read PostgreSQL integration test, `pnpm lint`, `pnpm --filter @lite-notion/web typecheck`, `pnpm --filter @lite-notion/web build`, `pnpm api:check` и `git diff --check`. Production build/dependency trace подтверждает проверяемую границу RSC/transport.
- [ ] 7.7 Запустить opt-in Playwright E2E в настроенном окружении и deployment smoke test реального storage redirect/CSP; не отмечать их выполненными при отсутствии fixture/runtime.

**Зависимости:** этапы 2, 4, 5 и 6.

**Готово, когда:** основные acceptance flows покрыты автоматическими тестами, RSC/anonymous transport boundary подтверждены production build, outbox ACK и cache semantics не противоречат друг другу, real storage redirect/CSP проверены в настроенном runtime, generated files согласованы, а все заявленные команды действительно успешны либо их ограничения явно записаны в PR.
