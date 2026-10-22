import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import type { PageDocumentRecord } from '../src/pages/page-document/page-document.repository';
import { ProjectPageSearchUseCase } from '../src/pages/page-document/use-cases/project-page-search.use-case';

const BATCH_SIZE = 25;
const rebuildAll = process.argv.includes('--all');

type SearchRebuildClient = Pick<PrismaService, '$queryRaw'>;

export interface SearchProjectionRebuildSummary {
  processed: number;
  projected: number;
  skipped: number;
  stale: number;
  failed: number;
}

export async function rebuildSearchProjections(
  prisma: SearchRebuildClient,
  projection: ProjectPageSearchUseCase,
  force: boolean,
): Promise<SearchProjectionRebuildSummary> {
  let cursor: string | null = null;
  const summary: SearchProjectionRebuildSummary = {
    processed: 0,
    projected: 0,
    skipped: 0,
    stale: 0,
    failed: 0,
  };

  while (true) {
    const records: PageDocumentRecord[] = force
      ? await prisma.$queryRaw<PageDocumentRecord[]>`
          SELECT document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
          FROM "PageDocument" document
          WHERE (${cursor}::uuid IS NULL OR document."pageId" > ${cursor}::uuid)
          ORDER BY document."pageId" ASC
          LIMIT ${BATCH_SIZE}
        `
      : await prisma.$queryRaw<PageDocumentRecord[]>`
          SELECT document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
          FROM "PageDocument" document
          LEFT JOIN "PageSearchDocument" projection ON projection."pageId" = document."pageId"
          WHERE (
            projection."pageId" IS NULL
            OR projection."sourceStorageRevision" IS NULL
            OR projection."sourceStorageRevision" < document."storageRevision"
          )
            AND (${cursor}::uuid IS NULL OR document."pageId" > ${cursor}::uuid)
          ORDER BY document."pageId" ASC
          LIMIT ${BATCH_SIZE}
        `;

    if (records.length === 0) break;

    for (const record of records) {
      cursor = record.pageId;
      summary.processed += 1;
      const outcome = await projection.execute(record, force);
      if (outcome === 'projected') summary.projected += 1;
      else if (outcome === 'skipped') summary.skipped += 1;
      else if (outcome === 'stale') summary.stale += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const summary = await rebuildSearchProjections(
      app.get(PrismaService),
      app.get(ProjectPageSearchUseCase),
      rebuildAll,
    );

    console.info(
      `Search projection rebuild processed ${summary.processed} page(s): ${summary.projected} projected, ${summary.skipped} skipped, ${summary.stale} stale, ${summary.failed} failed${rebuildAll ? ' (--all)' : ''}.`,
    );
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('scripts/rebuild-search-projection.ts')) {
  void main().catch((error: unknown) => {
    console.error(
      `Search projection rebuild failed: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    process.exitCode = 1;
  });
}
