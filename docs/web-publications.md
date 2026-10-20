# Web publications

Публичные страницы открываются по `/p/:slug`. Web загружает публикацию на сервере из настроенного `NEXT_PUBLIC_API_BASE_URL` запросом без пользовательских credentials и без persistent cache. Изменения видны при следующем HTTP-запросе страницы независимо от доставки revalidation event.

## Outbox receipt

`POST /api/internal/revalidate` — внутренний endpoint подтверждения доставки события backend outbox. Он проверяет общий bearer secret и структуру события, затем отвечает `204`; Next.js cache invalidation не выполняется, поскольку HTML и publication fetch не кэшируются. Endpoint не использует request Host.

Для доставки задайте одинаковое значение `PUBLICATION_REVALIDATION_TOKEN` в Web и API. В API задайте `PUBLICATION_REVALIDATION_URL` равным доверенному URL Web endpoint, например `https://web.example.com/api/internal/revalidate`. API и Web могут иметь разные origins. Не публикуйте secret через переменные с префиксом `NEXT_PUBLIC_`.

Если API URL или token не настроены, scheduler не отправляет события: строки остаются pending и backlog растёт. После восстановления конфигурации scheduler повторяет доставку; duplicate receipt безопасен. Успешно доставленные строки сохраняются в БД: в текущем backend нет retention cleanup, поэтому delivered rows продолжают занимать место. До отдельного решения о retention это следует наблюдать по размеру outbox.

Сквозной Playwright сценарий требует тестовый аккаунт редактора (`PLAYWRIGHT_USER_A_EMAIL`, `PLAYWRIGHT_USER_A_PASSWORD`), отдельную пустую страницу, предназначенную только для теста (`PLAYWRIGHT_PUBLICATION_DISPOSABLE_PAGE_ID`), и `PLAYWRIGHT_PUBLICATION_E2E_ENABLED=1`. E2E запускается против настроенного backend/API/storage окружения через существующий `PLAYWRIGHT_BASE_URL`; тест меняет содержимое, slug и publication status указанной страницы.

Подтверждение события не означает очистку Next.js cache и не является полноценным revalidation mechanism. Если Web позже начнёт кэшировать HTML или public API responses, этот endpoint contract и delivery semantics нужно пересмотреть до включения такого cache.
