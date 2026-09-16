import { Inject, Injectable } from '@nestjs/common';
import { PageNotFoundError } from '../pages/errors';
import { UsersService } from '../users/users.service';
import type { GrantableRole } from './constants';
import { PageRole } from './constants';
import {
  PermissionNotFoundError,
  PermissionOwnerGrantError,
  PermissionUserNotFoundError,
} from './errors';
import { assertRole, roleAtLeast } from './helpers';
import {
  type AccessiblePageRow,
  type PagePermissionRecord,
  PagePermissionsRepository,
} from './page-permissions.repository';

export interface PageAccessVerdict {
  canWrite: boolean;
  pageId: string;
  role: PageRole;
  userId: string;
}

/**
 * Единственная точка, через которую HTTP-слой спрашивает права. Правил вычисления
 * здесь нет — они в общем пакете; здесь только перевод роли в отказ нужного вида.
 */
@Injectable()
export class PagePermissionsService {
  constructor(
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  /** Роль либо `null`. Тот же ответ получает collaboration runtime. */
  resolveRole(userId: string, pageId: string): Promise<PageRole | null> {
    return this.permissions.resolveRole(userId, pageId);
  }

  /**
   * Роль не ниже требуемой либо отказ: `404`, когда доступа нет вовсе, и `403`,
   * когда страница видна, а роли не хватает.
   */
  async requireRole(userId: string, pageId: string, required: PageRole): Promise<PageRole> {
    return assertRole(await this.permissions.resolveRole(userId, pageId), required);
  }

  /**
   * Роль вместе с правом записи. Непустая роль уже означает живую страницу в живом
   * проекте, поэтому существование проверяется только здесь.
   */
  async requireAccess(userId: string, pageId: string): Promise<PageAccessVerdict> {
    const role = await this.permissions.resolveRole(userId, pageId);

    if (role === null) {
      throw new PageNotFoundError();
    }

    return { canWrite: roleAtLeast(role, PageRole.EDITOR), pageId, role, userId };
  }

  findAccessiblePages(userId: string): Promise<AccessiblePageRow[]> {
    return this.permissions.findAccessiblePages(userId);
  }

  /**
   * Выдача и изменение — одна идемпотентная операция: повторный вызов меняет роль и
   * второй строки не создаёт. Круг доступа расширяет только владелец дерева, поэтому
   * `owner`; редактору здесь `403` — страницу он видит.
   */
  async grant(actorId: string, pageId: string, email: string, role: GrantableRole) {
    await this.requireRole(actorId, pageId, PageRole.OWNER);

    const user = await this.users.findByEmail(email);

    if (user === null) {
      throw new PermissionUserNotFoundError();
    }

    if ((await this.permissions.findPageOwner(pageId)) === user.id) {
      throw new PermissionOwnerGrantError();
    }

    return this.permissions.upsert({
      grantedById: actorId,
      pageId,
      role: role === PageRole.EDITOR ? 'EDITOR' : 'VIEWER',
      userId: user.id,
    });
  }

  async revoke(actorId: string, pageId: string, userId: string): Promise<void> {
    await this.requireRole(actorId, pageId, PageRole.OWNER);

    if (!(await this.permissions.remove(pageId, userId))) {
      throw new PermissionNotFoundError();
    }
  }

  /** Круг доступа — сведения о других людях, поэтому список читает только владелец. */
  async findByPage(actorId: string, pageId: string): Promise<PagePermissionRecord[]> {
    await this.requireRole(actorId, pageId, PageRole.OWNER);

    return this.permissions.findByPage(pageId);
  }
}
