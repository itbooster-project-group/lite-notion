import { Inject, Injectable } from '@nestjs/common';
import type { TransactionScope } from '../database/transaction';
import { PageNotFoundError } from '../pages/errors';
import { PageRole } from './constants';
import { assertRole, roleAtLeast } from './helpers';
import {
  type AccessiblePageRow,
  type PagePermissionRecord,
  PagePermissionsRepository,
  type ResolvedPageRole,
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
  ) {}

  /** Роль либо `null`. Тот же ответ получает collaboration runtime. */
  resolveRole(userId: string, pageId: string): Promise<PageRole | null> {
    return this.permissions.resolveRole(userId, pageId);
  }

  resolveRoles(userId: string, pageIds: readonly string[]): Promise<ResolvedPageRole[]> {
    return this.permissions.resolveRoles(userId, pageIds);
  }

  bind(scope: TransactionScope): PagePermissionsService {
    return new PagePermissionsService(this.permissions.bind(scope));
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

  /** Круг доступа — сведения о других людях, поэтому список читает только владелец. */
  async findByPage(actorId: string, pageId: string): Promise<PagePermissionRecord[]> {
    await this.requireRole(actorId, pageId, PageRole.OWNER);

    return this.permissions.findByPage(pageId);
  }
}
