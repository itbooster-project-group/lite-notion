## Purpose

Позволяет пользователям с backend-разрешением управлять immutable publication из рабочего редактора, не смешивая состояние live document с публичной версией.

## ADDED Requirements

### Requirement: Publication status читается из authenticated backend contract

Web MUST получать publication state через `GET /api/v1/pages/:pageId/publication` и использовать DTO backend. Управляющие операции доступны только при существующем `canManagePage`/эквивалентном capability страницы; frontend MUST NOT вводить собственную модель ролей. Backend остаётся окончательной границей permission check.

#### Scenario: Страница никогда не публиковалась
- **WHEN** GET publication возвращает `404` с точным кодом `publication_not_found`, а страница уже успешно загружена с управляющим capability
- **THEN** UI показывает состояние `not published` и предлагает заполнить форму первого Publish

#### Scenario: Произвольный 404 при чтении publication
- **WHEN** запрос завершился другим 404, например `page_not_found`, либо ошибкой без известного кода `publication_not_found`
- **THEN** UI показывает ошибку/недоступность и MUST NOT трактовать ответ как `not published`

#### Scenario: Пользователь не имеет editor permission
- **WHEN** страница загружена как viewer или backend отвечает `403` на publication operation
- **THEN** управляющие controls не показываются либо блокируются, серверная ошибка отображается безопасно, editor и его состояние не закрываются

#### Scenario: Backend сообщает publication state
- **WHEN** GET возвращает `draft`, `published` или `unpublished` вместе со slug, SEO, `publishedAt` и `publicPath`
- **THEN** UI отображает состояние и поля из ответа; для `published` ссылка использует только publicPath `/p/:slug`

#### Scenario: Состояние изменений live document не предоставлено
- **WHEN** backend management DTO не содержит достоверного признака сравнения live revision с publication snapshot
- **THEN** UI не показывает индикатор «есть неопубликованные изменения» и не выводит его из локального dirty state, autosave, Yjs update или сравнения JSON

### Requirement: Первый Publish сохраняет настройки без частичной публичной публикации

Web MUST использовать существующие контракты: `PATCH /api/v1/pages/:pageId/publication` сохраняет slug/SEO и при отсутствии записи создаёт `draft` (slug обязателен), затем `POST /api/v1/pages/:pageId/publication/publish` с `{ slug }` создаёт опубликованный snapshot. Draft MUST оставаться недоступным по public API. Неуспешный Publish MUST сохранять draft-настройки для retry, но MUST NOT показывать успешную публикацию.

#### Scenario: Первый Publish успешен
- **WHEN** пользователь вводит slug/SEO, PATCH сохраняет draft, а Publish возвращает DTO со статусом `published`
- **THEN** UI показывает подтверждённый backend publicPath, доступные операции Republish/Unpublish и копирование/открытие ссылки

#### Scenario: Сохранение initial draft конфликтует по slug
- **WHEN** PATCH получает `409 publication_slug_conflict`
- **THEN** публикация не создаётся, поле slug получает понятную ошибку, а пользователь может исправить его и повторить

#### Scenario: Draft сохранён, но Publish завершился ошибкой
- **WHEN** PATCH успешен, а Publish отклонён из-за capture, projection, asset, permission или временного сбоя
- **THEN** UI показывает `not published`/ошибку и сохранённые настройки draft, позволяет повторить Publish, а public route остаётся недоступным

#### Scenario: Валидация Publish отклонена backend
- **WHEN** backend возвращает `400` для slug или `409 publication_asset_unavailable`/`publication_state_conflict`
- **THEN** UI показывает безопасное сообщение рядом с формой или операцией, не подменяет это состояние успехом и не закрывает редактор

### Requirement: Republish и Unpublish следуют backend state machine

Web MUST вызывать `POST .../republish` только для существующей publication со статусом `published` или `unpublished`; metadata-only slug/SEO изменения MUST использовать PATCH и MUST NOT сами создавать snapshot. `POST .../unpublish` переводит опубликованную версию в недоступное состояние. Серверная модель разрешает повторный unpublish как идемпотентный запрос; повторный Publish для уже опубликованной записи конфликтует. Republish создаёт новый immutable snapshot, не optimistic-обновляя public content до ответа backend.

#### Scenario: Успешный Republish
- **WHEN** пользователь явно запускает Republish и backend отвечает успешно
- **THEN** UI обновляет publication query из ответа/GET и сообщает об успехе только после подтверждения backend

#### Scenario: Republish не удался
- **WHEN** capture, projection, snapshot или asset validation завершаются ошибкой
- **THEN** UI показывает ошибку, инвалидирует/перечитывает management query и сохраняет прежний статус и public link без локальной подмены public content

#### Scenario: Metadata обновлена без Republish
- **WHEN** пользователь сохраняет новый slug, SEO title или description через PATCH
- **THEN** UI отражает metadata из успешного ответа, не запускает Republish и не сообщает о создании новой content version

#### Scenario: Unpublish подтверждён
- **WHEN** пользователь подтверждает Unpublish и backend возвращает `unpublished`
- **THEN** UI показывает статус `unpublished`, скрывает активную публичную ссылку/действие открытия и оставляет доступным повторную публикацию через Republish

#### Scenario: Unpublish отменён или повторён
- **WHEN** пользователь отменяет confirmation либо повторяет Unpublish на уже `unpublished` записи
- **THEN** отмена не отправляет запрос, а повторный backend success сохраняет отображаемое состояние `unpublished`

### Requirement: Publication form и mutations доступны и восстанавливаемы

Management UI MUST валидировать slug для UX, но считать backend normalization/uniqueness authoritative. Он MUST использовать generated DTO/hooks, существующие shadcn wrappers, React Hook Form/Zod и TanStack Query. Во время каждой mutation повторные действия блокируются; после успеха инвалидируется publication query, а ошибки не закрывают страницу редактора.

#### Scenario: Slug conflict или validation error
- **WHEN** backend отвечает slug conflict или validation error
- **THEN** сообщение связано с соответствующим input, ввод сохраняется и запрос можно повторить после исправления

#### Scenario: Mutations выполняются одновременно
- **WHEN** Publish, Republish, PATCH metadata или Unpublish находится в pending
- **THEN** повторный submit и конфликтующие publication actions отключены, а статус операции доступен screen reader

#### Scenario: Query обновляется после операции
- **WHEN** любая управляющая команда успешно завершается
- **THEN** TanStack Query обновляет/инвалидирует только релевантное состояние publication, не обновляя live document content

#### Scenario: Ошибка publication operation
- **WHEN** операция завершается сетевой, серверной или permission ошибкой
- **THEN** форма и редактор остаются смонтированы, показан retry/безопасный текст ошибки, success state не отображается

### Requirement: Неопределённый mutation outcome сверяется с backend без автоматического повтора

При network failure, timeout, abort без HTTP response или 5xx Web MUST считать mutation outcome неопределённым, а не подтверждённым отказом. Web MUST перечитать management status и обновить UI только если GET даёт достаточное operation-specific подтверждение. Для Republish подтверждением нового snapshot служит только `status: published` с `publishedAt`, отличающимся от значения перед запросом; `status: published` без изменения timestamp недостаточен. Если GET показывает прежнее состояние либо недоступен, UI MUST сохранить нейтральный `uncertain` state и позволить безопасно обновить status. Web MUST NOT автоматически повторять Publish, Republish или иную mutation после неопределённого результата. Подтверждённые backend domain errors MUST оставаться обычными ошибками операции.

#### Scenario: Первый Publish выполнен, но HTTP response потерян
- **WHEN** backend завершил первый Publish, а browser получил network error/timeout
- **THEN** UI выполняет management GET; если ответ содержит `published` и запрошенный slug, UI синхронизирует publication и показывает publicPath как подтверждённый результат

#### Scenario: Publish пока не подтверждён status GET
- **WHEN** первый Publish завершился без HTTP response, а последующий GET показывает `draft` или сам завершается ошибкой
- **THEN** UI показывает нейтральное сообщение, что результат нельзя подтвердить, не заявляет отказ или успех и не повторяет Publish автоматически

#### Scenario: Unpublish выполнен, но HTTP response потерян
- **WHEN** backend завершил Unpublish, а browser получил network error/timeout
- **THEN** UI перечитывает status и считает результат подтверждённым только если DTO сообщает `unpublished`; иначе сохраняет uncertain state без автоматического повтора

#### Scenario: Republish response потерян
- **WHEN** backend мог создать новый snapshot, но browser получил network error/timeout/5xx
- **THEN** UI перечитывает management status; `status: published` с изменившимся `publishedAt` относительно значения до команды подтверждает новую версию, а published с прежним timestamp не доказывает ни успех, ни отказ и оставляет uncertain state. Republish автоматически не повторяется

#### Scenario: Metadata PATCH response потерян
- **WHEN** metadata PATCH не получил HTTP response
- **THEN** UI перечитывает publication DTO; только совпадение всех изменённых полей подтверждает желаемый metadata state, иначе UI показывает нейтральный uncertain state и сохраняет введённые значения

#### Scenario: Подтверждённый backend domain error
- **WHEN** mutation получает явный domain 4xx, например slug conflict, validation, permission или state conflict
- **THEN** UI показывает соответствующую ошибку как подтверждённый отказ и не смешивает её с network-uncertain outcome
