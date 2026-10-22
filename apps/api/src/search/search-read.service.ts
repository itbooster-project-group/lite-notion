import { Inject, Injectable } from '@nestjs/common';
import { TransactionRunner } from '../database/transaction';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { SearchRepository, type SearchResultRecord } from './search.repository';

const CANDIDATE_BATCH_SIZE = 100;

@Injectable()
export class SearchReadService {
  constructor(
    @Inject(SearchRepository) private readonly search: SearchRepository,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
  ) {}

  async searchPages(
    userId: string,
    queryInput: string,
    limit: number,
  ): Promise<SearchResultRecord[]> {
    const query = queryInput.trim();
    if (query.length === 0) return [];

    const firstBatch = await this.search.findCandidates(query, CANDIDATE_BATCH_SIZE, 0);
    if (firstBatch.length === 0) return [];

    return this.transactions.run(
      async (scope) => {
        const transactionSearch = this.search.bind(scope);
        const transactionPermissions = this.permissions.bind(scope);
        const results: SearchResultRecord[] = [];
        const seen = new Set<string>();
        let candidates = firstBatch;
        let offset = 0;

        while (results.length < limit && candidates.length > 0) {
          offset += candidates.length;
          const roles = await transactionPermissions.resolveRoles(
            userId,
            candidates.map(({ pageId }) => pageId),
          );
          const allowedIds = new Set(roles.map(({ pageId }) => pageId));
          if (allowedIds.size > 0) {
            const bodyMatchIds = candidates
              .filter(({ bodyMatch, pageId }) => bodyMatch && allowedIds.has(pageId))
              .map(({ pageId }) => pageId);
            const details = await transactionSearch.findVisibleResults(
              [...allowedIds],
              bodyMatchIds,
              query,
            );
            const detailsById = new Map(details.map((result) => [result.pageId, result]));

            for (const candidate of candidates) {
              const detail = detailsById.get(candidate.pageId);
              if (detail === undefined || seen.has(candidate.pageId)) continue;
              seen.add(candidate.pageId);
              results.push(detail);
              if (results.length === limit) break;
            }
          }

          if (results.length < limit) {
            candidates = await transactionSearch.findCandidates(
              query,
              CANDIDATE_BATCH_SIZE,
              offset,
            );
          }
        }

        return results;
      },
      { isolationLevel: 'RepeatableRead', timeoutMs: 5000 },
    );
  }
}
