import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { UsersService } from '../../users/users.service';
import { PageRole } from '../constants';
import { PermissionOwnerGrantError, PermissionUserNotFoundError } from '../errors';
import { assertRole } from '../helpers';
import { PagePermissionsRepository } from '../page-permissions.repository';

@Injectable()
export class GrantPagePermissionUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async execute(actorId: string, pageId: string, email: string, role: 'EDITOR' | 'VIEWER') {
    const user = await this.users.findByEmail(email);
    if (user === null) throw new PermissionUserNotFoundError();

    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(actorId));
      const permissions = this.permissions.bind(scope);
      assertRole(await permissions.resolveRole(actorId, pageId), PageRole.OWNER);

      if ((await permissions.findPageOwner(pageId)) === user.id) {
        throw new PermissionOwnerGrantError();
      }

      return permissions.upsert({
        grantedById: actorId,
        pageId,
        role,
        userId: user.id,
      });
    });
  }
}
