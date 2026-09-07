import { Inject, Injectable } from '@nestjs/common';

import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PagesRepository } from '../pages.repository';

/**
 * Подтверждения нет намеренно: гибнет ровно то, что показывает корзина. Блокировка
 * владельца не даёт параллельному удалению оставить поддерево наполовину.
 */
@Injectable()
export class PurgePagesTrashUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(ownerId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      await this.pages.bind(scope).deleteAllDeletedByOwner(ownerId);
    });
  }
}
