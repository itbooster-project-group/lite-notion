import { Inject, Injectable } from '@nestjs/common';
import { ownerLock } from '../../common/helpers';
import { TransactionRunner } from '../../database/transaction';
import { PageRole } from '../../page-permissions/constants';
import { assertRole } from '../../page-permissions/helpers';
import { PagePermissionsRepository } from '../../page-permissions/page-permissions.repository';
import { publicationPath } from '../../publications/helpers';
import { PublicationsRepository } from '../../publications/publications.repository';
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
    @Inject(PublicationsRepository)
    private readonly publications: PublicationsRepository,
  ) {}

  execute(pageId: string, actorId: string): Promise<void> {
    return this.transactions.run(async (scope) => {
      // Owner lock also serializes inherited permission changes and publication writes.
      await scope.lock(ownerLock(actorId));
      assertRole(await this.permissions.bind(scope).resolveRole(actorId, pageId), PageRole.OWNER);

      // Одна отметка на всё поддерево — по ней отсчитывается срок хранения.
      const pages = this.pages.bind(scope);
      const pageIds = await pages.findLiveSubtreeIds(pageId);
      const publicationRepository = this.publications.bind(scope);
      const slugs = await publicationRepository.findPublishedPageSlugs(pageIds);
      const marked = await pages.markSubtreeDeleted(pageId, actorId, new Date());

      if (marked === 0) {
        throw new PageNotFoundError();
      }
      await publicationRepository.markPublishedUnpublished(pageIds);
      await publicationRepository.createRevalidation(slugs.map(publicationPath));
    });
  }
}
