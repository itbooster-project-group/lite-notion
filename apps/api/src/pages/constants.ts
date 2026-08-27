/**
 * Алфавит fractional rank. Порядок символов совпадает с порядком их кодов в
 * ASCII, поэтому сравнение рангов в PostgreSQL (`ORDER BY position`) и в
 * JavaScript даёт одну и ту же последовательность. Менять порядок символов
 * нельзя: уже сохранённые ранги перестанут сравниваться так же.
 */
export const POSITION_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Совпадает с `@db.VarChar(255)` у `Page.position`. */
export const POSITION_MAX_LENGTH = 255;

export const TITLE_MAX_LENGTH = 255;

/**
 * Версия Tiptap-схемы, которой размечается свежесозданный пустой документ.
 * Инкрементируется, когда меняется схема редактора.
 */
export const TIPTAP_SCHEMA_VERSION = 1;

/**
 * Предел размера Yjs state в байтах. Значение выбрано без данных о реальных
 * документах — см. openspec design.md, раздел 2b. Применяется дважды: как
 * валидация DTO и как лимит парсера тела запроса.
 */
export const DOCUMENT_MAX_BYTES = 1024 * 1024;
