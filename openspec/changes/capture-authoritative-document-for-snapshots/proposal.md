## Зачем

Snapshot-инфраструктура уже сохраняет неизменяемое Yjs-состояние, но caller должен передать bytes и provenance. Оставшаяся часть issue #48 связывает authoritative collaboration document с persisted `storageRevision`, чтобы snapshot не связывал состояние с revision другого состояния.

## Что меняется

- Добавляется единый capture contract, который возвращает Yjs bytes, persisted revision этих bytes и TipTap schema version документа.
- Для active Hocuspocus document capture один раз кодирует и сохраняет именно live bytes; если документа нет в памяти, используется согласованная persisted запись.
- API orchestration для manual snapshot сначала проверяет edit permission, получает capture и передаёт его в `CreateSnapshotManualUseCase`; metadata reads остаются в read-only `SnapshotsService`.
- Capture result можно повторно использовать в будущих workflows, включая publication, без добавления publication/rendering логики.
- Гарантия ограничена текущим single-instance collaboration; public snapshot endpoint и изменение snapshot schema или allocation не добавляются.

## Возможности

### Новые возможности

Нет.

### Изменяемые возможности

- `document-snapshot-persistence`: требует согласованного capture state и provenance, а orchestration snapshot использует один capture result.

## Затрагиваемые части

- HTTP обработка Hocuspocus и существующий collaboration-to-API client/persistence adapter.
- API provenance `PageDocument`, internal DTO, collaboration HTTP client/configuration и snapshot application orchestration.
- Collaboration tests и PostgreSQL API integration tests. Новые зависимости и миграция базы не требуются.
