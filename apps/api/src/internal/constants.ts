/** Вне `/api/v1`: другая аутентификация, и шлюз отсекает префикс по началу пути. */
export const INTERNAL_ROUTE_PREFIX = 'internal';

export const INTERNAL_AUTHENTICATE_PATH = `${INTERNAL_ROUTE_PREFIX}/authenticate`;
export const INTERNAL_PAGE_ACCESS_PATH = `${INTERNAL_ROUTE_PREFIX}/pages/:pageId/access`;
export const INTERNAL_PAGE_DOCUMENT_PATH = `${INTERNAL_ROUTE_PREFIX}/pages/:pageId/document`;

/** Заголовок сервисного креденшла. Не `Authorization`: там ходит токен пользователя. */
export const INTERNAL_SERVICE_TOKEN_HEADER = 'x-internal-service-token';

/** Шлюз переносит их на запрос к адресату, затирая клиентские копии. */
export const INTERNAL_IDENTITY_USER_HEADER = 'x-user-id';
export const INTERNAL_IDENTITY_SESSION_HEADER = 'x-session-id';
