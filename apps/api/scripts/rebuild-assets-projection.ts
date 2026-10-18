import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import type { PageDocumentRecord } from '../src/pages/page-document/page-document.repository';
import { ProjectPageAssetsUseCase } from '../src/pages/page-document/use-cases/project-page-assets.use-case';

const batchSize = 25;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const prisma = app.get(PrismaService);
    const projection = app.get(ProjectPageAssetsUseCase);
    let cursor: string | null = null;
    let processed = 0;

    while (true) {
      const records = await prisma.$queryRaw<PageDocumentRecord[]>`
      SELECT document."pageId", document."storageRevision", document."tiptapSchemaVersion", document."yjsState"
      FROM "PageDocument" AS document
      INNER JOIN "PageAssetProjection" AS projection ON projection."pageId" = document."pageId"
      WHERE projection."sourceStorageRevision" IS DISTINCT FROM document."storageRevision"
        AND (${cursor}::uuid IS NULL OR document."pageId" > ${cursor}::uuid)
      ORDER BY document."pageId" ASC
      LIMIT ${batchSize}
    `;
      if (records.length === 0) break;

      for (const record of records) await projection.execute(record);
      processed += records.length;
      cursor = records.at(-1)?.pageId ?? cursor;
    }

    const remaining = await prisma.$queryRaw<
      Array<{
        pageId: string;
        storageRevision: bigint;
        attemptedStorageRevision: bigint | null;
        attemptCount: number;
        lastErrorCode: string | null;
      }>
    >`
    SELECT document."pageId", document."storageRevision", projection."attemptedStorageRevision",
      projection."attemptCount", projection."lastErrorCode"
    FROM "PageDocument" AS document
    INNER JOIN "PageAssetProjection" AS projection ON projection."pageId" = document."pageId"
    WHERE projection."sourceStorageRevision" IS DISTINCT FROM document."storageRevision"
    ORDER BY document."pageId" ASC
    LIMIT ${batchSize}
  `;
    const staleCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "PageDocument" AS document
    INNER JOIN "PageAssetProjection" AS projection ON projection."pageId" = document."pageId"
    WHERE projection."sourceStorageRevision" IS DISTINCT FROM document."storageRevision"
  `;
    const remainingCount = staleCount[0]?.count ?? 0n;
    console.info(
      `Asset projection rebuild processed ${processed} page(s); ${remainingCount} remain stale.`,
    );
    if (remainingCount > 0n) {
      console.error(
        JSON.stringify(
          remaining.map((page) => ({
            ...page,
            storageRevision: page.storageRevision.toString(),
            attemptedStorageRevision: page.attemptedStorageRevision?.toString() ?? null,
          })),
        ),
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Asset projection rebuild failed: ${error instanceof Error ? error.name : 'unknown'}`,
  );
  process.exitCode = 1;
});
