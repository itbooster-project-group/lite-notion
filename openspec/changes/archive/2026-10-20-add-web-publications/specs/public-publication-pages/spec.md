## Purpose

Даёт анонимным посетителям быструю server-rendered страницу из текущего immutable publication rendering и сохраняет неизменность публичного содержимого между явными публикациями.

## ADDED Requirements

### Requirement: Public route читает только backend publication read model

Путь `/p/[slug]` MUST быть доступен без authentication и получать title, SEO, schemaVersion, contentJson, assets и cover только из `GET /api/v1/public/publications/:slug`. Gateway MUST обходить `ext_authz` только для `GET /api/v1/public/publications/…`; прочие методы и пути `/api/v1/` MUST оставаться за авторизацией. Server transport MUST быть анонимным: он MUST NOT читать module-level auth state и MUST NOT пересылать пользовательские `Authorization` или `Cookie` headers; он MUST использовать `cache: 'no-store'` и не использовать `apiFetch`. Для типов MUST использовать generated `PublicPublicationDto`/asset DTO через type-only imports; generated endpoint module с React Query MUST NOT входить в server dependency graph. Маршрут MUST NOT читать private pages API, live page metadata, Y.Doc, `PAGE_DOCUMENTS`, Hocuspocus или локальный editor state. Успешный SSR MUST использовать immutable backend rendering и MUST NOT гидрировать редактор.

#### Scenario: Анонимный посетитель открывает опубликованную страницу
- **WHEN** public API возвращает валидную publication по slug
- **THEN** сервер возвращает страницу с snapshot title/content и SEO без access token и без editor runtime

#### Scenario: Анонимный public GET проходит через gateway
- **WHEN** анонимный запрос `GET /api/v1/public/publications/:slug` или `GET /api/v1/public/publications/:slug/assets/:assetId` проходит через Envoy
- **THEN** gateway направляет запрос в API без `ext_authz`, а остальные методы и пути `/api/v1/` продолжают требовать авторизацию

#### Scenario: Live document изменён после Publish
- **WHEN** редактор меняет live document, но не выполняет Republish
- **THEN** повторный SSR показывает тот же `contentJson` и title из активного snapshot

#### Scenario: Republish переключил snapshot
- **WHEN** Republish backend успешно переключил current snapshot
- **THEN** последующий SSR получает новое immutable rendering из public API

### Requirement: Schema provenance соответствует текущей записи документа

При принятом API write текущим collaboration/editor runtime backend MUST сохранять рядом с Yjs state актуальную schema version, если входящая version legacy ниже текущей версии API. Incoming version, которая выше версии API, MUST сохраняться без понижения. Обновление schema version и Yjs bytes MUST происходить одной операцией записи, без migration отдельной строки. Это позволяет текущему редактору добавлять schema-v2 media в legacy page и затем публиковать captured state.

#### Scenario: Текущий редактор добавляет asset image в legacy page
- **WHEN** документ с сохранённой schema version 1 изменён редактором текущей schema version 2 и persisted Yjs state содержит image `source` с asset ID
- **THEN** API сохраняет state с schema version 2; повторный capture и projection принимают asset image при валидных asset/grant, и Republish может продолжить обычные проверки

#### Scenario: API получает state с будущей schema version
- **WHEN** incoming document write заявляет schema version выше текущей API
- **THEN** API не понижает версию до своей текущей и publication projection продолжает fail closed для неподдерживаемой версии

### Requirement: Static renderer отображает поддерживаемую TipTap schema безопасно

Публичный renderer MUST использовать те же schema extensions и URL/media normalizers, что фактическая schema редактора v2, включая headings 1–3, paragraphs, bullet/ordered/task lists, links, hard breaks, supported marks и текущие image/YouTube/video nodes. Он MUST использовать совместимый с Server Components `@tiptap/static-renderer` или имеющийся эквивалент, MUST NOT использовать `useEditor`, `EditorContent`, NodeViews, `dangerouslySetInnerHTML`, `Y.Doc` или collaboration runtime. Неподдерживаемые nodes MUST безопасно пропускаться или сводиться к допустимому содержимому, не ломая соседние узлы; небезопасные URL/marks MUST удаляться нормализаторами schema.

#### Scenario: Supported document nodes и marks
- **WHEN** contentJson содержит допустимые schema-v2 узлы и marks
- **THEN** SSR сохраняет семантические headings, списки, paragraphs, links, форматирование и поддерживаемые media presentations

#### Scenario: Неизвестный или некорректный node
- **WHEN** отдельный node неизвестен, имеет неверные атрибуты или небезопасную ссылку
- **THEN** renderer применяет safe fallback к этому узлу, сохраняет безопасных соседей и не создаёт произвольный HTML или executable URL

#### Scenario: Неизвестная schema version
- **WHEN** public DTO содержит schemaVersion, которую приложение не поддерживает
- **THEN** публикация считается невалидной для текущего renderer, body использует безопасный not-found, metadata не раскрывает slug/backend details и JSON не интерпретируется частично

#### Scenario: Публичный bundle/runtime boundary
- **WHEN** production trace публичного route проверяется после сборки
- **THEN** его dependency trace не содержит `@tiptap/react`, Hocuspocus provider, Yjs, Awareness или Collaboration extensions

### Requirement: Публичные images и cover используют snapshot-safe asset resolver

Для asset image node renderer MUST сопоставлять `source.assetId` только с descriptor из public DTO `assets`; cover MUST браться только из DTO `cover`. Сохранённый `contentJson` MUST содержать source identity, а не temporary signed URL. `resolverPath` MUST точно соответствовать `/api/v1/public/publications/:slug/assets/:assetId` для текущего slug и descriptor UUID; произвольные same-origin paths, query/hash, absolute URLs и другие endpoints MUST отклоняться. Валидный путь MUST разрешаться в абсолютный URL относительно настроенного `NEXT_PUBLIC_API_BASE_URL` (API origin), а не относительно текущего URL страницы и не через недоверенный HTTP Host. HTML использует resolver endpoint; endpoint сам проверяет актуальное snapshot membership и возвращает 302 на short-lived signed object URL. Разрешены только media refs, присутствующие в DTO текущей опубликованной версии.

#### Scenario: Asset image текущего snapshot
- **WHEN** asset image ссылается на assetId, присутствующий в DTO assets
- **THEN** SSR указывает абсолютный API resolver URL, API отвечает redirect к временному signed URL, а storage key и signed URL не попадают в rendering/contentJson

#### Scenario: Asset descriptor отсутствует до SSR
- **WHEN** image node ссылается на asset ID, отсутствующий среди descriptors текущего DTO
- **THEN** SSR не строит URL и показывает безопасный placeholder; private asset endpoint не вызывается и storage metadata не раскрывается

#### Scenario: Resolver отвечает 404 после генерации HTML
- **WHEN** browser image request получает 404 после того, как HTML уже отдан
- **THEN** небольшой изолированный client image boundary скрывает неудачное изображение и показывает fallback; он не импортирует editor/collaboration runtime. Server-side SSR не обещает обнаружить этот поздний 404.

#### Scenario: Cover опубликованного snapshot
- **WHEN** public DTO содержит cover descriptor
- **THEN** SSR отображает cover именно из descriptor, а не из live page cover; если cover отсутствует, cover region не отображается

#### Scenario: Live image удалён после Publish
- **WHEN** image node/cover больше не относится к live document, но asset всё ещё находится в активной publication snapshot/cover
- **THEN** public image продолжает разрешаться backend resolver до смены/снятия текущей публикации согласно backend retention contract

#### Scenario: Разные origins frontend и API
- **WHEN** SSR route и API обслуживаются разными origins
- **THEN** абсолютный resolver URL строится из `NEXT_PUBLIC_API_BASE_URL`; произвольный `Host`/`Forwarded` header посетителя не меняет адрес API

#### Scenario: CSP пропускает resolver redirect
- **WHEN** браузер загружает image через API resolver, который отвечает 302 на signed URL storage
- **THEN** CSP разрешает configured API origin для начального image request и фактический HTTPS storage origin после redirect; policy не выводит origin из request headers и не разрешает произвольные дополнительные источники

### Requirement: Metadata и unavailable semantics используют единый loader

Next.js `generateMetadata` и body MUST использовать один per-request loader и одинаково классифицировать ответ. Metadata использует только public DTO title/SEO; body heading uses snapshot title. Canonical URL MUST выводиться только при наличии достоверной настроенной site origin; в текущей конфигурации без такого origin canonical не добавляется. Backend 404 и HTTP 200 с неполным/невалидным DTO (включая unsupported schemaVersion и некорректный resolverPath) MUST давать одинаковый безопасный not-found и не раскрывать существование private page. Для такого ответа metadata MUST быть нейтральной и не включать slug или backend response. Network error и 5xx MUST NOT обрабатываться как not-found: они показывают общий временный error response без приватных сведений.

#### Scenario: SEO опубликованной страницы
- **WHEN** public API возвращает title, seoTitle и seoDescription
- **THEN** `generateMetadata` формирует title/description из этого ответа, а тело отображает snapshot title

#### Scenario: Нет достоверного site origin
- **WHEN** приложение знает только относительный `publicPath` и API origin, но не имеет отдельной frontend site origin configuration
- **THEN** canonical не строится из API origin или request Host и не включается в metadata

#### Scenario: Недоступная или невалидная publication
- **WHEN** API возвращает 404 либо 200 с неполным/невалидным DTO для unknown, unpublished, deleted или unsupported publication
- **THEN** Next.js вызывает единый not-found flow и не рендерит live/private metadata

#### Scenario: Временная ошибка backend
- **WHEN** public API недоступен или возвращает 5xx
- **THEN** loader возвращает общий error boundary/5xx, body и metadata не отображают backend message или приватные данные и не маркируют страницу как 404 или опубликованную

### Requirement: Public page layout адаптивен и изолирован от workspace

Публичная страница MUST находиться в независимом public route composition без private workspace shell/sidebar. Рендер MUST сохранять semantic headings, lists, links, alt/decorative semantics, быть пригодным для keyboard navigation и отображаться на mobile/tablet/desktop.

#### Scenario: Anonymous responsive rendering
- **WHEN** пользователь открывает public URL без сессии на desktop, tablet или mobile viewport
- **THEN** содержимое читаемо, адаптивно и не включает навигацию workspace или интерактивные editor controls
