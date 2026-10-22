import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface SearchCandidate {
  pageId: string;
  titleMatch: boolean;
  bodyMatch: boolean;
  titleRank: number;
  bodyRank: number;
}

export interface SearchResultRecord {
  pageId: string;
  title: string;
  snippet: string | null;
}

@Injectable()
export class SearchRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findCandidates(query: string, limit: number, offset: number): Promise<SearchCandidate[]> {
    return this.prisma.$queryRaw<SearchCandidate[]>`
      WITH parsed AS (
        SELECT websearch_to_tsquery('simple', ${query}) AS query
      ), usable AS (
        SELECT query FROM parsed WHERE querytree(query) NOT IN ('', 'T')
      ), candidates AS (
        SELECT page.id AS "pageId",
               TRUE AS "titleMatch",
               FALSE AS "bodyMatch",
               ts_rank_cd(setweight(to_tsvector('simple', COALESCE(page."title", '')), 'A'), usable.query) AS "titleRank",
               0::real AS "bodyRank"
        FROM "Page" page
        JOIN "Project" project
          ON project.id = page."projectId" AND project."deletedAt" IS NULL
        CROSS JOIN usable
        WHERE page."deletedAt" IS NULL
          AND to_tsvector('simple', COALESCE(page."title", '')) @@ usable.query

        UNION ALL

        SELECT page.id AS "pageId",
               FALSE AS "titleMatch",
               TRUE AS "bodyMatch",
               0::real AS "titleRank",
               ts_rank_cd(setweight(projection."searchVector", 'D'), usable.query) AS "bodyRank"
        FROM "PageSearchDocument" projection
        JOIN "PageDocument" document ON document."pageId" = projection."pageId"
        JOIN "Page" page
          ON page.id = projection."pageId" AND page."deletedAt" IS NULL
        JOIN "Project" project
          ON project.id = page."projectId" AND project."deletedAt" IS NULL
        CROSS JOIN usable
        WHERE projection."sourceStorageRevision" = document."storageRevision"
          AND projection."searchVector" @@ usable.query
      ), grouped AS (
        SELECT "pageId",
               BOOL_OR("titleMatch") AS "titleMatch",
               BOOL_OR("bodyMatch") AS "bodyMatch",
               MAX("titleRank") AS "titleRank",
               MAX("bodyRank") AS "bodyRank"
        FROM candidates
        GROUP BY "pageId"
      )
      SELECT "pageId", "titleMatch", "bodyMatch", "titleRank", "bodyRank"
      FROM grouped
      ORDER BY "titleMatch" DESC,
               GREATEST("titleRank", "bodyRank") DESC,
               "pageId" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  findVisibleResults(
    pageIds: readonly string[],
    bodyMatchIds: readonly string[],
    query: string,
  ): Promise<SearchResultRecord[]> {
    if (pageIds.length === 0) return Promise.resolve([]);

    return this.prisma.$queryRaw<SearchResultRecord[]>`
      WITH parsed AS (
        SELECT websearch_to_tsquery('simple', ${query}) AS query
      )
      SELECT page.id AS "pageId",
             page."title",
             CASE
               WHEN page.id = ANY(${[...bodyMatchIds]}::uuid[])
                AND projection."sourceStorageRevision" = document."storageRevision"
               THEN left(
                 ts_headline(
                   'simple', projection."plainText", parsed.query,
                   'StartSel=, StopSel=, MaxFragments=1, MinWords=10, MaxWords=35'
                 ),
                 240
               )
               ELSE NULL
             END AS "snippet"
      FROM "Page" page
      JOIN "Project" project
        ON project.id = page."projectId" AND project."deletedAt" IS NULL
      LEFT JOIN "PageDocument" document ON document."pageId" = page.id
      LEFT JOIN "PageSearchDocument" projection ON projection."pageId" = page.id
      CROSS JOIN parsed
      WHERE page.id = ANY(${[...pageIds]}::uuid[])
        AND page."deletedAt" IS NULL
    `;
  }
}
