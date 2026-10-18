import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { projectDocument } from '../../../document-projection/document-projection';
import type { PageDocumentRecord } from '../page-document.repository';

@Injectable()
export class ProjectPageAssetsUseCase {
  private readonly logger = new Logger(ProjectPageAssetsUseCase.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(record: PageDocumentRecord): Promise<void> {
    try {
      const projection = projectDocument({
        yjsState: record.yjsState,
        tiptapSchemaVersion: record.tiptapSchemaVersion,
      });
      const assetRefs = projection.mediaReferences.filter(
        (
          reference,
        ): reference is Extract<(typeof projection.mediaReferences)[number], { type: 'asset' }> =>
          reference.type === 'asset',
      );
      const assetIds = [...new Set(assetRefs.map(({ assetId }) => assetId))].sort();

      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "storageRevision" FROM "PageDocument" WHERE "pageId" = ${record.pageId}::uuid FOR UPDATE`;
        const current = await tx.pageDocument.findUnique({
          where: { pageId: record.pageId },
          select: { storageRevision: true },
        });
        if (!current || current.storageRevision !== record.storageRevision) return;

        if (assetIds.length > 0) {
          await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ANY(${assetIds}::uuid[]) ORDER BY id FOR UPDATE`;
        }
        const [assets, grants] =
          assetIds.length === 0
            ? [[], []]
            : await Promise.all([
                tx.asset.findMany({
                  where: { id: { in: assetIds }, status: 'ready' },
                  select: { id: true },
                }),
                tx.pageAssetGrant.findMany({
                  where: { pageId: record.pageId, assetId: { in: assetIds } },
                  select: { assetId: true },
                }),
              ]);
        const eligible = new Set(assets.map(({ id }) => id));
        const granted = new Set(grants.map(({ assetId }) => assetId));
        if (assetIds.some((id) => !eligible.has(id) || !granted.has(id))) {
          throw new Error('asset_reference_ineligible');
        }

        await tx.pageAsset.deleteMany({ where: { pageId: record.pageId } });
        if (assetRefs.length > 0) {
          await tx.pageAsset.createMany({
            data: assetRefs.map(({ assetId, nodeId }) => ({
              pageId: record.pageId,
              assetId,
              nodeId,
            })),
            skipDuplicates: true,
          });
        }
        await tx.pageAssetProjection.update({
          where: { pageId: record.pageId },
          data: {
            sourceStorageRevision: record.storageRevision,
            attemptedStorageRevision: record.storageRevision,
            attemptCount: 0,
            retryAfter: null,
            lastErrorCode: null,
          },
        });
      });
    } catch (error) {
      const permanent = isPermanentProjectionError(error);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "storageRevision" FROM "PageDocument" WHERE "pageId" = ${record.pageId}::uuid FOR UPDATE`;
          const document = await tx.pageDocument.findUnique({
            where: { pageId: record.pageId },
            select: { storageRevision: true },
          });
          if (!document || document.storageRevision !== record.storageRevision) return;

          const current = await tx.pageAssetProjection.findUnique({
            where: { pageId: record.pageId },
            select: { attemptCount: true, attemptedStorageRevision: true },
          });
          const attempts =
            current?.attemptedStorageRevision === record.storageRevision ? current.attemptCount : 0;
          const exhausted = !permanent && attempts >= 7;
          const reason = permanent
            ? 'permanent_validation'
            : exhausted
              ? 'retry_exhausted'
              : 'transient_projection';
          await tx.pageAssetProjection.updateMany({
            where: { pageId: record.pageId },
            data: {
              attemptedStorageRevision: record.storageRevision,
              attemptCount: attempts + 1,
              retryAfter:
                permanent || exhausted ? null : new Date(Date.now() + retryDelay(attempts)),
              lastErrorCode: reason,
            },
          });
          this.logger.warn(`Asset projection is stale for page ${record.pageId}: ${reason}`);
        });
      } catch {
        this.logger.warn(
          `Asset projection diagnostics could not be stored for page ${record.pageId}`,
        );
      }
    }
  }
}

function retryDelay(attemptCount: number): number {
  return Math.min(300_000, 1_000 * 2 ** Math.min(attemptCount, 8));
}

function isPermanentProjectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'DocumentProjectionError' || error.message === 'asset_reference_ineligible')
  );
}
