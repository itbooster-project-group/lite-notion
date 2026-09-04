import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageNotFoundError } from '../errors';
import { PagesRepository } from '../pages.repository';

/**
 * Перемещение страницы и её живого поддерева в корзину. Блокировка владельца — тот
 * же ключ, что у перемещения: иначе живая страница осталась бы под удалённым предком.
 */
@Injectable()
export class SoftDeletePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(pageId: string, ownerId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      // Одна отметка на всё поддерево — по ней отсчитывается срок хранения.
      const marked = await this.pages.bind(scope).markSubtreeDeleted(pageId, ownerId, new Date());

      if (marked === 0) {
        throw new PageNotFoundError();
      }
    });
  }
}
