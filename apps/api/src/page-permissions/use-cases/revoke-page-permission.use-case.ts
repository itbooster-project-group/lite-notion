import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageRole } from '../constants';
import { PermissionNotFoundError } from '../errors';
import { assertRole } from '../helpers';
import { PagePermissionsRepository } from '../page-permissions.repository';

@Injectable()
export class RevokePagePermissionUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagePermissionsRepository) private readonly permissions: PagePermissionsRepository,
  ) {}

  async execute(actorId: string, pageId: string, userId: string): Promise<void> {
    await this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(actorId));
      const permissions = this.permissions.bind(scope);
      assertRole(await permissions.resolveRole(actorId, pageId), PageRole.OWNER);

      if (!(await permissions.remove(pageId, userId))) {
        throw new PermissionNotFoundError();
      }
    });
  }
}
