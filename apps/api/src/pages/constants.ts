export { DOCUMENT_MAX_BYTES, TIPTAP_SCHEMA_VERSION } from '@lite-notion/database';

/**
 * Алфавит fractional rank в порядке ASCII-кодов; приложение сравнивает ранги по
 * code units. Совпадение с порядком в PostgreSQL держит collation `"C"` у колонки
 * `Page.position` (миграция `20260828081500_pin_page_position_collation`) — без неё
 * locale базы дал бы другой порядок (`l` < `V` против
 * `V` < `l`), и «последний брат» вернул бы не тот ранг.
 *
 * Порядок символов менять нельзя: сохранённые ранги перестанут сравниваться так же.
 */
export const POSITION_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Совпадает с `@db.VarChar(255)` у `Page.position`. */
export const POSITION_MAX_LENGTH = 255;

export const TITLE_MAX_LENGTH = 255;

/**
 * Версия Tiptap-схемы, которой размечается свежесозданный пустой документ.
 * Инкрементируется, когда меняется схема редактора.
 */
