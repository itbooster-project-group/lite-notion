## ADDED Requirements

### Requirement: Credentialed Bearer transport web-клиента
Общий transport generated web-клиента MUST отправлять cross-origin cookie credentials, добавлять доступный in-memory access-токен в Bearer header и обновлять истёкший access-токен без ручного дублирования transport-контрактов endpoints.

При `401` защищённого запроса transport MUST выполнить не более одного refresh для всех одновременно ожидающих запросов, обновить access-токен и повторить каждый исходный запрос не более одного раза. Login, register и сам refresh MUST уметь отключить автоматический retry, чтобы не создавать refresh-loop.

#### Scenario: Авторизованный generated request
- **WHEN** generated operation выполняется при наличии access-токена
- **THEN** transport отправляет `credentials: include` и Bearer header с текущим токеном

#### Scenario: Параллельные ответы 401
- **WHEN** несколько защищённых запросов одновременно получают `401`
- **THEN** transport выполняет один refresh, после чего каждый запрос повторяется один раз с новым access-токеном

#### Scenario: Запоздалый ответ старого access-токена
- **WHEN** один запрос уже завершил refresh, а другой запрос только после этого получает `401` на предыдущий access-токен
- **THEN** второй запрос повторяется с актуальным токеном без дополнительного refresh

#### Scenario: Refresh устаревшего поколения сессии
- **WHEN** access-токен очищен либо transport configuration заменена до завершения уже запущенного refresh
- **THEN** устаревшая операция не устанавливает полученный токен, не завершает актуальную сессию и не вызывает callbacks новой configuration

#### Scenario: Refresh не восстановил доступ
- **WHEN** single-flight refresh завершается `401`
- **THEN** transport очищает in-memory токен, уведомляет session lifecycle об unauthenticated состоянии и не повторяет refresh рекурсивно
