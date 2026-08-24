import { API_GLOBAL_PREFIX } from '../common/constants';

/** Имя passport-стратегии, на которую опирается `JwtAuthGuard`. */
export const JWT_STRATEGY_NAME = 'jwt';

/**
 * Единственное сообщение для обеих причин отказа при входе. Разные тексты
 * позволили бы перебором выяснить, какие адреса зарегистрированы.
 */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Email is already registered';

export const NAME_MAX_LENGTH = 64;

/** Минимум задан в символах: 8 символов кириллицы — это уже 16 байт, ограничивать их незачем. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt молча обрезает вход ровно на 72 БАЙТАХ, а не символах. Граница задана в
 * байтах: проверка по символам пропускала бы пароли, от которых до хеша доходит
 * только часть, — 40 символов кириллицы это 80 байт, 36 emoji это 144 байта.
 */
export const PASSWORD_MAX_BYTES = 72;

/** Общее описание для Swagger: ограничение одно и то же на регистрации и на входе. */
export const PASSWORD_API_DESCRIPTION =
  'bcrypt truncates its input at 72 UTF-8 bytes, so the limit is measured in bytes, not characters: 40 Cyrillic characters or 18 emoji already exceed it.';

export const PASSWORD_API_EXAMPLE = 'correct horse battery staple';

/** Длина случайной части refresh-токена: 32 байта из CSPRNG, перебор невозможен. */
export const REFRESH_TOKEN_BYTES = 32;

export const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Cookie ограничена путём эндпоинтов аутентификации: на остальные маршруты
 * refresh-токен не отправляется, потому что они авторизуются bearer-токеном.
 */
export const REFRESH_COOKIE_PATH = `/${API_GLOBAL_PREFIX}/auth`;

/**
 * Окно, в течение которого отозванная ротацией сессия ещё принимается. Покрывает
 * гонку параллельных запросов клиента и повтор после потерянного ответа; за его
 * пределами предъявление отозванной сессии означает утечку токена.
 */
export const REFRESH_GRACE_PERIOD_MS = 30_000;

/**
 * Отозванные строки удаляются не сразу: 30 секунд из них нужны grace-периоду,
 * а сверх того они остаются следом для расследования сработавшего обнаружения
 * повторного использования.
 */
export const REVOKED_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
