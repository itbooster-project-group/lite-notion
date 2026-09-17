## MODIFIED Requirements

### Requirement: Collaboration authentication follows the application session

Provider MUST отправлять актуальный access token через публичный auth callback. После authentication failure frontend MUST выполнить ограниченный refresh token flow и повторить подключение с новым access token; окончательный отказ MUST перевести session в безопасное offline/error state без бесконечного reconnect loop.

Auth callback MUST возвращать токен, действительный на момент вызова: если срок жизни имеющегося access token истёк или близок к истечению, callback MUST обновить его перед возвратом. Возврат заведомо истекающего токена MUST NOT считаться допустимым поведением — сервер вправе запросить токен в любой момент жизни соединения, и просроченный ответ приведёт к разрыву исправного соединения.

Frontend MUST отвечать на запрос токена от сервера по уже открытому соединению тем же auth callback и MUST NOT требовать для этого переподключения или повторной синхронизации документа.

Успешное продление MUST быть незаметным для пользователя: содержимое документа, позиция курсора и список участников MUST сохраняться.

#### Scenario: Access token is refreshed before reconnect
- **GIVEN** текущий access token истёк во время disconnect
- **WHEN** provider начинает reconnect
- **THEN** token callback получает refreshed access token
- **AND** provider повторно аутентифицирует room этим token

#### Scenario: Токен обновляется по запросу сервера
- **GIVEN** соединение открыто, а срок жизни выданного access token подходит к концу
- **WHEN** сервер запрашивает действующий токен по этому соединению
- **THEN** frontend возвращает свежий access token
- **AND** соединение продолжает работать без переподключения

#### Scenario: Близкий к истечению токен обновляется до возврата
- **WHEN** auth callback вызывается при access token, срок которого истекает в ближайшее время
- **THEN** callback обновляет токен и возвращает новый, а не имеющийся

#### Scenario: Продление не сбрасывает состояние редактора
- **GIVEN** пользователь редактирует документ в открытой сессии
- **WHEN** выполняется продление соединения свежим токеном
- **THEN** содержимое документа и список участников остаются прежними
- **AND** редактор не показывает повторную загрузку

#### Scenario: Authentication remains rejected
- **WHEN** collaboration service отклоняет token после допустимой refresh attempt
- **THEN** session не становится ready или остаётся без active connection
- **AND** пользователь получает безопасное состояние authentication failure без token details

#### Scenario: Отзыв доступа во время сессии переводит в безопасное состояние
- **GIVEN** у пользователя открыта collaboration session
- **WHEN** сервер закрывает соединение после того, как доступ к странице был отозван
- **THEN** session переходит в безопасное состояние без бесконечного reconnect loop
- **AND** пользователь не продолжает редактировать документ, к которому доступ потерян
