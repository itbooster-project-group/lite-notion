import { PageRole } from '@lite-notion/page-permissions';
import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { PageNotFoundError } from '../errors';
import { PagesRepository } from '../pages.repository';

/**
 * Перемещение страницы и её живого поддерева в корзину. Блокировка владельца — тот
 * же ключ, что у перемещения: иначе живая страница осталась бы под удалённым предком.
 *
 * Требует роли `owner`: удаление уносит поддерево в корзину владельца, и распоряжаться
 * этим может только он. Редактор страницу видит, поэтому получает `403`, а не `404`.
 */
@Injectable()
export class SoftDeletePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
    @Inject(PagePermissionsRepository)
    private readonly permissions: PagePermissionsRepository,
  ) {}

  execute(pageId: string, actorId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      assertRole(await this.permissions.bind(scope).resolveRole(actorId, pageId), PageRole.OWNER);

      // Роль `owner` есть только у владельца страницы, поэтому ключ блокировки — актор.
      await scope.lock(ownerLock(actorId));

      // Одна отметка на всё поддерево — по ней отсчитывается срок хранения.
      const marked = await this.pages.bind(scope).markSubtreeDeleted(pageId, actorId, new Date());

      if (marked === 0) {
        throw new PageNotFoundError();
      }
    });
  }
}
