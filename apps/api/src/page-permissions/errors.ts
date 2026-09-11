/**
 * Email не соответствует ни одному пользователю. Приглашений незарегистрированных в
 * этой задаче нет, поэтому выдать разрешение некому.
 */
export class PermissionUserNotFoundError extends Error {
  constructor() {
    super('User with this email not found');
    this.name = 'PermissionUserNotFoundError';
  }
}

/**
 * Разрешение выдаётся владельцу этой же страницы. Он и так имеет полный доступ, а
 * строка разрешения ему не положена — её запрещает и модель, и здравый смысл.
 * `400`, а не `409`: запрос внутренне противоречив.
 */
export class PermissionOwnerGrantError extends Error {
  constructor() {
    super('The page owner already has full access and cannot be granted a permission');
    this.name = 'PermissionOwnerGrantError';
  }
}

/** Отзывать нечего: прямого разрешения этому пользователю на этой странице нет. */
export class PermissionNotFoundError extends Error {
  constructor() {
    super('Permission not found');
    this.name = 'PermissionNotFoundError';
  }
}
