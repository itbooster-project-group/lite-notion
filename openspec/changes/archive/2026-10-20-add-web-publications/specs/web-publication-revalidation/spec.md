## Purpose

Делает свежесть `/p/:slug` независимой от cache invalidation и принимает настроенные backend outbox events, чтобы подтверждённые события не оставались pending.

## ADDED Requirements

### Requirement: Public SSR не сохраняется в долгоживущем cache

Public publication route MUST быть dynamic SSR, выполнять backend fetch с `cache: 'no-store'` и отдавать HTML с `Cache-Control: private, no-store, max-age=0`. Backend public API уже отвечает `Cache-Control: no-store`. Web MUST NOT использовать persistent Next.js cache для DTO или HTML. `revalidatePath` MUST NOT использоваться: для этого runtime-контракта он не обновляет uncached data или HTML.

#### Scenario: Publish, republish или metadata change до доставки outbox
- **WHEN** backend committed изменение, но outbox event ещё не ACK-нут
- **THEN** следующий SSR request читает актуальный backend response без cache и не зависит от event delivery

#### Scenario: Unpublish или soft delete до доставки outbox
- **WHEN** backend уже возвращает safe 404, но event ещё pending
- **THEN** следующий SSR request возвращает safe not-found; предыдущий HTML не хранится Next.js как долгоживущий cache, а уже открытая вкладка не обещает мгновенный отзыв

### Requirement: Web принимает и безопасно подтверждает настроенные outbox events

Web MUST предоставить минимальный `POST /api/internal/revalidate` receipt endpoint для backend `{eventId, paths}`. Он MUST проверить server-only bearer token, валидный event ID и непустые publication paths только вида `/p/:slug`, затем вернуть 204. Endpoint MUST NOT вызывать `revalidatePath`, строить URL из request Host, сохранять состояние события или добавлять очередь. Некорректный payload/token/config MUST приводить к безопасному non-2xx без раскрытия секрета. Этот endpoint служит consumer/ACK для настроенной backend доставки, а не механизмом свежести SSR.

#### Scenario: Доставка валидного события
- **WHEN** backend отправляет payload с валидным токеном и publication paths
- **THEN** endpoint валидирует event и отвечает 204, позволяя backend подтвердить текущий lease; route cache invalidation не вызывается

#### Scenario: Повторная доставка после remote success или потерянного ACK
- **WHEN** backend повторно доставляет тот же event
- **THEN** валидный duplicate снова получает 204 без побочного эффекта и не может вернуть прежнюю publication

#### Scenario: Неверный token, payload или path
- **WHEN** токен неверный/отсутствует либо `paths` содержит произвольный путь, absolute URL, query или path вне `/p/:slug`
- **THEN** endpoint отклоняет запрос без ACK, без cache operation и без раскрытия токена/внутренней конфигурации

#### Scenario: Backend endpoint/token не настроены
- **WHEN** API не имеет полной пары `PUBLICATION_REVALIDATION_URL`/`PUBLICATION_REVALIDATION_TOKEN`
- **THEN** существующий scheduler не claim-ит outbox rows, фиксирует warning; SSR остаётся корректным, но pending rows накапливаются с успешными publication changes

### Requirement: Outbox delivery является eventual и не обещает retention или мгновенный отзыв

Backend delivery может задерживаться и повторяться после lease expiry/restart; ACK endpoint MUST обрабатывать повторы идемпотентно. Текущая backend модель сохраняет `deliveredAt` rows и не содержит retention cleanup, поэтому Web ACK снижает pending backlog, но MUST NOT заявлять ограниченный общий размер outbox. Эта backend retention особенность фиксируется как operational risk вне реализации Web #53. Уже отданный HTML и signed object URL с TTL 60 секунд не отзываются мгновенно.

#### Scenario: Outbox повтор доставляется после lease expiry или restart
- **WHEN** backend повторяет событие после потери lease/перезапуска
- **THEN** endpoint принимает валидный повтор одинаковым 204, а backend lease token защищает ACK от устаревшего worker

#### Scenario: Slug changed
- **WHEN** backend присылает старый и новый route path после смены slug
- **THEN** endpoint валидирует оба `/p/:slug` значения как один event; ни один path не преобразуется в cache invalidation

#### Scenario: Проверка outbox retention при выпуске
- **WHEN** Web/API deployment проверяется для production
- **THEN** подтверждены настройка delivery endpoint/token и наблюдаемость pending backlog; отдельно признано, что delivered rows сохраняются в PostgreSQL без cleanup в текущем backend
