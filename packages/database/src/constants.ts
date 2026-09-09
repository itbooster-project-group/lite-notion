/**
 * Версия Tiptap-схемы, которой размечается свежесозданный пустой документ.
 * Инкрементируется, когда меняется схема редактора.
 */
export const TIPTAP_SCHEMA_VERSION = 1;

/**
 * Предел размера Yjs state в байтах. Значение выбрано без данных о реальных
 * документах и применяется как API DTO limit и WebSocket payload limit.
 */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;
