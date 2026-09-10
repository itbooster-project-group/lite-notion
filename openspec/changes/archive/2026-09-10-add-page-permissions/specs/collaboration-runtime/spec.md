## ADDED Requirements

### Requirement: Изменение доступа и уже открытое соединение
Collaboration runtime MUST принимать решение о доступе в момент подключения. Отзыв разрешения, понижение роли и переключение страницы в `restricted` MUST применяться к новым соединениям немедленно и MUST NOT требовать перезапуска сервиса.

Уже открытое соединение при этом MUST сохранять выданный ему режим до переподключения: enforcement прав в середине сессии в этой задаче не вводится. Ограничение MUST быть описанным, а не подразумеваемым, — читатель спецификации MUST узнавать о нём отсюда, а не из наблюдения за системой.

Тот же предел MUST действовать и для истечения access-токена: соединение, открытое по действующему токену, переживает его истечение. Обе границы имеют одну природу и MUST сниматься вместе, а не порознь.

Единственное исключение — инварианты документа, которые runtime проверяет сам при сохранении: комната страницы, помеченной удалённой, MUST закрываться, как того требует персистентность. Права по этому пути MUST NOT перепроверяться: persistence hooks не занимаются авторизацией.

#### Scenario: Отзыв применяется к новому соединению
- **GIVEN** владелец отозвал разрешение у пользователя с открытым соединением
- **WHEN** этот пользователь подключается к той же комнате заново
- **THEN** collaboration runtime отклоняет соединение

#### Scenario: Понижение роли применяется к новому соединению
- **GIVEN** владелец сменил роль пользователя с `editor` на `viewer`
- **WHEN** этот пользователь подключается к комнате заново
- **THEN** соединение открывается только на чтение

#### Scenario: Открытое соединение сохраняет режим до переподключения
- **WHEN** разрешение отзывается у пользователя, соединение которого уже открыто
- **THEN** его текущее соединение продолжает работать в прежнем режиме до переподключения
- **AND** это ограничение зафиксировано, а не обнаруживается опытным путём

## MODIFIED Requirements

### Requirement: Collaboration checks page access before document sync
До разрешения document connection collaboration runtime MUST проверить, что parsed page существует, не удалена, лежит в неудалённом проекте, имеет `PageDocument` row и доступна authenticated user по effective permission. Page, которая отсутствует, недоступна user, удалена, лежит в удалённом проекте или не имеет document row, MUST отклоняться без раскрытия конкретной причины.

Effective permission MUST вычисляться той же моделью, которой пользуется REST API, и MUST NOT реализовываться в `apps/collaboration` повторно. Расхождение между решением API и решением collaboration runtime для одной пары «пользователь — страница» MUST NOT быть возможным.

Access decision MUST возвращать read/write capability boundary, вычисленный из роли: `viewer` MUST давать чтение без записи, `editor` и владелец страницы MUST давать чтение и запись. Runtime MUST map `canWrite` from that capability to Hocuspocus `connectionConfig.readOnly`.

Доступ MUST следовать границам наследования: пользователь, которому разрешение выдано на предка страницы, MUST допускаться к её комнате, а страница за границей `restricted` без собственного разрешения MUST отклоняться так же, как чужая.

#### Scenario: User can access own live page
- **WHEN** authenticated user подключается к `page:<pageId>` для своей non-deleted page
- **THEN** collaboration runtime разрешает document connection с write capability

#### Scenario: User without access is rejected
- **WHEN** authenticated user подключается к page другого owner, на которую ему ничего не выдано
- **THEN** collaboration runtime отклоняет connection без раскрытия существования page

#### Scenario: Deleted page is rejected
- **WHEN** authenticated user подключается к своей deleted page
- **THEN** collaboration runtime отклоняет connection и не пишет document state для этой page

#### Scenario: Страница удалённого проекта отклоняется
- **WHEN** authenticated user подключается к своей non-deleted page, проект которой помечен удалённым
- **THEN** collaboration runtime отклоняет connection тем же способом, что и удалённую page

#### Scenario: Читатель подключается только на чтение
- **GIVEN** пользователю выдан `viewer` на чужой странице
- **WHEN** он подключается к её комнате
- **THEN** collaboration runtime разрешает соединение и выставляет его read-only
- **AND** его Yjs updates не сохраняются в document state

#### Scenario: Редактор подключается с правом записи
- **GIVEN** пользователю выдан `editor` на чужой странице
- **WHEN** он подключается к её комнате
- **THEN** collaboration runtime разрешает соединение с write capability
- **AND** его изменения синхронизируются другим клиентам комнаты и сохраняются

#### Scenario: Доступ по унаследованному разрешению
- **GIVEN** пользователю выдан `editor` на чужой странице, а комната принадлежит её потомку в режиме `inherit`
- **WHEN** он подключается к комнате потомка
- **THEN** collaboration runtime разрешает соединение с write capability

#### Scenario: Граница restricted отклоняет соединение
- **GIVEN** пользователю выдан `editor` на чужой странице, а комната принадлежит её потомку в режиме `restricted` без собственного разрешения
- **WHEN** он подключается к комнате этого потомка
- **THEN** collaboration runtime отклоняет connection тем же способом, что и чужую page

#### Scenario: REST и collaboration решают одинаково
- **WHEN** для одной и той же пары «пользователь — страница» роль запрашивают REST API и collaboration runtime
- **THEN** оба получают одну и ту же роль, и право записи у них совпадает
