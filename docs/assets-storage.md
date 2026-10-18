# Assets и private object storage

`AssetsModule` хранит файлы в закрытом S3-compatible bucket. Первый production provider — Selectel Object Storage через стандартный AWS SDK for JavaScript v3. Доменная модель хранит `storageKey`, checksum и metadata; endpoint, region и bucket живут только в runtime config. Публичные object URL не сохраняются.

## Local development и конфигурация

Для обычного запуска API object storage не требуется. В локальной разработке без S3 файловые endpoints недоступны; object storage не добавляется в Docker Compose. Автоматические тесты используют временный filesystem adapter или in-memory adapter.

Production должен задавать `ASSETS_S3_ENDPOINT`, `ASSETS_S3_REGION`, `ASSETS_S3_BUCKET`, `ASSETS_S3_ACCESS_KEY_ID`, `ASSETS_S3_SECRET_ACCESS_KEY` и при необходимости `ASSETS_S3_FORCE_PATH_STYLE`. Credentials принадлежат только API. Bucket остаётся private.

Ограничения upload настраиваются через `ASSETS_MAX_UPLOAD_BYTES` (не более 10 MiB), `ASSETS_MAX_CONCURRENT_UPLOADS` и `ASSETS_UPLOAD_TIMEOUT_MS`. S3 запросы ограничиваются `ASSETS_S3_REQUEST_TIMEOUT_MS`; подписанная ссылка на чтение действует `ASSETS_READ_URL_TTL_SECONDS`. Сборка мусора включается отдельно флагом `ASSETS_GC_ENABLED`.

## API и lifecycle

- `POST /api/v1/assets/uploads` создаёт pending asset. `pageId` задаёт page upload context; без него создаётся avatar upload context.
- `PUT /api/v1/assets/:assetId/content` принимает raw bytes через NestJS, ограничивает поток и временный файл, проверяет JPEG/PNG/WebP signature и заявленный MIME, считает SHA-256 и пишет в S3.
- `GET /api/v1/assets/:assetId?pageId=...` возвращает metadata только при page permission и grant/reference правилах.
- `POST /api/v1/assets/:assetId/read-url?pageId=...` создаёт краткоживущий signed GET URL после авторизации.
- `POST /api/v1/pages/:pageId/assets/:assetId/grant` разрешает uploader-у выдать eligibility для другой страницы.
- `PUT /api/v1/pages/:pageId/assets/cover` назначает или очищает cover.
- `PUT /api/v1/users/me/avatar` назначает или очищает собственный avatar.
- `GET /api/v1/users/:userId/avatar/:assetId/read-url` выдаёт signed GET для текущего avatar после аутентификации.
- `DELETE /api/v1/assets/:assetId` выполняет идемпотентное logical delete, если нет удерживающих references.

Lifecycle: `pending → ready|failed → deleted`. У каждого Put есть новый server-generated attempt key. Ready object никогда не перезаписывается. Неизвестный результат PostgreSQL commit не является основанием удалять object; reconciliation сначала читает текущую Asset row и удаляет только key с committed tombstone либо подтверждённо отсутствующую Asset row после orphan grace.

## Document projection и очистка

Document persistence использует expected `storageRevision` CAS. Hocuspocus `onStoreDocument` работает внутри существующего `document.saveMutex`; capture из snapshot infrastructure #93 использует тот же mutex. CAS conflict возвращает latest persisted Y.Doc, который collaboration объединяет в live document и повторяет ограниченное число раз.

После commit API вызывает общий Document Projection #97 на точные persisted bytes. Asset refs с отсутствующим grant или не-ready Asset не отклоняют уже live-synced документ и не попадают в `PAGE_ASSETS`. Marker не продвигается, metadata/read fail closed, а scheduler повторяет временные ошибки с bounded backoff. Постоянная validation ошибка подавляется для той же revision до нового document write или ручного rebuild.

Новый пустой документ получает current empty `PageAssetProjection` в транзакции создания страницы. Существующие страницы после migration сохраняют NULL watermark до rebuild. GC включается после диагностики initial rebuild.

GC запускается обычным Nest interval и ограничивает размер прохода. Он координирует операции row locks: grant pages сначала по `pageId`, затем Asset; проверяет marker каждой page и `PAGE_ASSETS`, cover и avatar references; `PageAssetGrant` сам по себе не удерживает объект. Pending/failed uploads удаляются после TTL, а rotated orphan keys — после grace period. Ready assets удаляются только по явному запросу uploader-а, чтобы незакреплённая загрузка не исчезла до того, как клиент прикрепит её. Физическое удаление следует за committed tombstone; повторный проход завершает S3 delete после временного сбоя. Будущий #52 добавляет publication snapshot reference к retention check перед tombstone.

## CI и Selectel smoke

Required PR CI использует локальный PostgreSQL service, применяет migrations, запускает unit и integration suites, lint, typecheck, build и OpenAPI/client generation check. CI не требует Selectel credentials и не запускает S3 service.

Workflow `Selectel S3 smoke` запускается вручную до первого production deployment. Настройте secrets `SELECTEL_S3_ENDPOINT`, `SELECTEL_S3_REGION`, `SELECTEL_S3_SMOKE_BUCKET`, `SELECTEL_S3_ACCESS_KEY_ID`, `SELECTEL_S3_SECRET_ACCESS_KEY` и variable `SELECTEL_S3_FORCE_PATH_STYLE`. Выделите отдельный test bucket или разрешите только префикс `assets-smoke/`. Workflow проверяет Put, Head, presigned GET с реальным fetch bytes без AWS credentials на клиенте, Delete и отсутствие объекта; cleanup выполняется также при ошибке. Filesystem tests сами по себе не подтверждают Selectel/SigV4 compatibility.

## Перенос на другой S3-compatible provider

Переключение выполняется в maintenance window; параллельные активные providers не поддерживаются.

1. Приостановить новые uploads и физическое удаление объектов.
2. Скопировать все objects в новый bucket с теми же `storageKey`.
3. Сверить количество objects, keys, sizes и SHA-256 сохранённый при upload; не трактовать ETag как MD5. Для проверки checksum прочитать bytes подходящим способом.
4. Проверить PutObject, HeadObject, signed GET и фактический GET bytes, DeleteObject и отсутствие объекта в изолированном smoke prefix.
5. Переключить endpoint, region, bucket, credentials и path-style config.
6. Проверить чтение существующих assets и новый upload, затем возобновить uploads и GC.
7. Не удалять исходные objects до успешной проверки и окончания безопасного периода rollback.

Если ключи сохранены, изменения Asset rows в PostgreSQL не нужны. Автоматической миграции, dual-write и failover нет.
