import { Inject, Injectable } from '@nestjs/common';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { SearchRepository, type SearchResultRecord } from './search.repository';

const CANDIDATE_BATCH_SIZE = 100;

@Injectable()
export class SearchReadService {
  constructor(
    @Inject(SearchRepository) private readonly search: SearchRepository,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
  ) {}

  async searchPages(
    userId: string,
    queryInput: string,
    limit: number,
  ): Promise<SearchResultRecord[]> {
    const query = queryInput.trim();
    if (query.length === 0) return [];

    const results: SearchResultRecord[] = [];
    const seen = new Set<string>();
    let offset = 0;

    while (results.length < limit) {
      const candidates = await this.search.findCandidates(query, CANDIDATE_BATCH_SIZE, offset);
      if (candidates.length === 0) break;
      offset += candidates.length;

      const roles = await this.permissions.resolveRoles(
        userId,
        candidates.map(({ pageId }) => pageId),
      );
      const allowedIds = new Set(roles.map(({ pageId }) => pageId));
      if (allowedIds.size === 0) continue;

      const bodyMatchIds = candidates
        .filter(({ bodyMatch, pageId }) => bodyMatch && allowedIds.has(pageId))
        .map(({ pageId }) => pageId);
      const details = await this.search.findVisibleResults([...allowedIds], bodyMatchIds, query);
      const detailsById = new Map(details.map((result) => [result.pageId, result]));

      for (const candidate of candidates) {
        const detail = detailsById.get(candidate.pageId);
        if (detail === undefined || seen.has(candidate.pageId)) continue;
        seen.add(candidate.pageId);
        results.push(detail);
        if (results.length === limit) break;
      }
    }

    return results;
  }
}
