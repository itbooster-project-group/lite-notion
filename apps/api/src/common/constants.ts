/** Общий prefix всех прикладных HTTP-маршрутов. */
export const API_GLOBAL_PREFIX = 'api/v1';

/**
 * Предел размера JSON-тела запроса. Отказ по превышению должен
 * формировать DTO единым форматом ошибок, а не парсер тела сырым `413`.
 */
export const JSON_BODY_LIMIT = '2mb';
