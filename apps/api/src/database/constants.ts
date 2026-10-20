/**
 * Текущая версия Tiptap-схемы. Запись документа повышает legacy version до этой
 * версии, чтобы новые schema attributes сохранялись с корректной provenance.
 */
export const TIPTAP_SCHEMA_VERSION = 2;

/**
 * Предел итогового Yjs state в байтах. Значение выбрано без данных о реальных
 * документах и применяется перед persistence и в API DTO. WebSocket payload
 * ограничивается отдельной runtime-настройкой.
 */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;
