import { Inject, Injectable } from '@nestjs/common';

import { PurgeConfirmationRequiredError } from '../../common/errors';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageNotFoundError } from '../errors';
import { PagesRepository } from '../pages.repository';

/**
 * Уносит всё физическое поддерево. Сбор перечня и удаление идут одной транзакцией:
 * иначе уничтожено будет не то, что подтвердили.
 */
@Injectable()
export class PurgePageUseCase {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PagesRepository) private readonly pages: PagesRepository,
  ) {}

  execute(pageId: string, ownerId: string, cascade: boolean): Promise<void> {
    return this.transactions.run(async (scope) => {
      await scope.lock(ownerLock(ownerId));

      const pages = this.pages.bind(scope);

      if ((await pages.findDeletedForOwner(pageId, ownerId)) === null) {
        throw new PageNotFoundError();
      }

      if (!cascade) {
        const doomed = await pages.findSelfDeletedDescendantTitles(pageId);

        if (doomed.length > 0) {
          throw new PurgeConfirmationRequiredError(doomed);
        }
      }

      await pages.deleteById(pageId);
    });
  }
}
