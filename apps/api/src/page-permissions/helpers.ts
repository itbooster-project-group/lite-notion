import { type PageRole, roleAtLeast } from '@lite-notion/page-permissions';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { PageNotFoundError, PageRoleInsufficientError } from '../pages/errors';
import {
  PermissionNotFoundError,
  PermissionOwnerGrantError,
  PermissionUserNotFoundError,
} from './errors';

/**
 * Переводит роль в решение. Отдельная функция, потому что вызывается и сервисом, и
 * юзкейсами под транзакцией: правило «404 при отсутствии доступа, 403 при нехватке
 * роли» должно существовать в одном месте.
 *
 * Порядок проверок существен: `null` уходит в `404` раньше, чем сравнение ролей,
 * поэтому `PageRoleInsufficientError` невозможно бросить, не установив доступ.
 */
export function assertRole(role: PageRole | null, required: PageRole): PageRole {
  if (role === null) {
    throw new PageNotFoundError();
  }

  if (!roleAtLeast(role, required)) {
    throw new PageRoleInsufficientError();
  }

  return role;
}

/**
 * Свой перевод в HTTP, а не общий с `pages`: иначе модуль разрешений импортировал бы
 * из модуля, который сам от него зависит. Правила те же — недоступное отвечает `404`,
 * нехватка роли на видимой странице `403`.
 */
export async function toHttpException<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof PageNotFoundError ||
      error instanceof PermissionUserNotFoundError ||
      error instanceof PermissionNotFoundError
    ) {
      throw new NotFoundException(error.message);
    }

    if (error instanceof PageRoleInsufficientError) {
      throw new ForbiddenException(error.message);
    }

    if (error instanceof PermissionOwnerGrantError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }
}
