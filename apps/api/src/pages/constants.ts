/**
 * Алфавит fractional rank. Символы идут в порядке своих ASCII-кодов, и
 * приложение сравнивает ранги по code units.
 *
 * Совпадение с порядком в PostgreSQL держится НЕ этим свойством, а явной
 * collation `"C"` у колонки `Page.position` (миграция
 * `20260828081500_pin_page_position_collation`). Без неё колонка наследует
 * locale базы: в `en_US.UTF-8` буквы сравниваются алфавитно (`l` < `V`), а по
 * кодам — наоборот (`V` < `l`). Запрос «последний брат» вернул бы тогда не тот
 * ранг, и новая страница встала бы не последней.
 *
 * Менять порядок символов нельзя: уже сохранённые ранги перестанут
 * сравниваться так же.
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
