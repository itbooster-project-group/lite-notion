import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { PrismaService } from '../database/prisma.service';
import { assertStorageKey, OBJECT_STORAGE, type ObjectStorage } from './storage/object-storage';

class GrantSetChangedError extends Error {}

class StalePageProjectionError extends Error {}

@Injectable()
export class AssetGcUseCases {
  private readonly logger = new Logger(AssetGcUseCases.name);
  private orphanContinuationToken: string | undefined;
  private deletedAssetsCursor: string | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  async delete(actorId: string, assetId: string): Promise<void> {
    await this.markDeleted(actorId, assetId, true);
  }

  async reconcileDeletedAssets(): Promise<void> {
    const deleted = await this.prisma.asset.findMany({
      where: { status: 'deleted' },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      ...(this.deletedAssetsCursor ? { cursor: { id: this.deletedAssetsCursor }, skip: 1 } : {}),
      take: this.config.assets.gcBatchSize,
      select: { id: true, storageKey: true },
    });
    this.deletedAssetsCursor =
      deleted.length === this.config.assets.gcBatchSize ? deleted.at(-1)?.id : undefined;
    for (const asset of deleted) await this.deleteObjectIfTombstoned(asset.id, asset.storageKey);
  }

  async cleanupExpiredPendingAssets(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.assets.pendingTtlHours * 3_600_000);
    const expired = await this.prisma.asset.findMany({
      where: { status: { in: ['pending', 'failed'] }, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: this.config.assets.gcBatchSize,
      select: { id: true, uploadedById: true },
    });
    for (const asset of expired) {
      try {
        await this.markDeleted(asset.uploadedById, asset.id, false, cutoff);
      } catch (error) {
        if (!(error instanceof StalePageProjectionError)) {
          this.logger.warn(
            `Expired asset cleanup deferred for ${asset.id}: ${error instanceof Error ? error.message : 'unknown'}`,
          );
        }
      }
    }
  }

  async cleanupOrphanedObjects(): Promise<void> {
    const cutoff = Date.now() - this.config.assets.orphanGraceHours * 3_600_000;
    const page = await this.storage.listObjects(
      'assets/',
      this.orphanContinuationToken,
      this.config.assets.gcBatchSize,
    );
    this.orphanContinuationToken = page.continuationToken ?? undefined;
    for (const object of page.objects) {
      if (object.lastModified === null || object.lastModified.getTime() > cutoff) continue;
      try {
        assertStorageKey(object.key);
        const asset = await this.prisma.asset.findUnique({
          where: { storageKey: object.key },
          select: { status: true },
        });
        if (!asset || asset.status === 'deleted') await this.storage.deleteObject(object.key);
      } catch {
        // Unknown PostgreSQL state is never proof that the key is unused.
      }
    }
  }

  private async markDeleted(
    actorId: string,
    assetId: string,
    explicit: boolean,
    expiredBefore?: Date,
  ): Promise<void> {
    let deletedKey: string | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        deletedKey = await this.prisma.$transaction(async (tx) => {
          const grants = await tx.pageAssetGrant.findMany({
            where: { assetId },
            orderBy: { pageId: 'asc' },
            select: { pageId: true },
          });
          const pageIds = grants.map(({ pageId }) => pageId);
          if (pageIds.length > 0) {
            await tx.$queryRaw`SELECT "pageId" FROM "PageDocument" WHERE "pageId" = ANY(${pageIds}::uuid[]) ORDER BY "pageId" FOR UPDATE`;
          }
          await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId}::uuid FOR UPDATE`;
          const currentGrants = await tx.pageAssetGrant.findMany({
            where: { assetId },
            orderBy: { pageId: 'asc' },
            select: { pageId: true },
          });
          if (pageIds.join(',') !== currentGrants.map(({ pageId }) => pageId).join(',')) {
            throw new GrantSetChangedError();
          }

          const current = await tx.asset.findUnique({ where: { id: assetId } });
          if (!current) {
            if (explicit) throw new UnauthorizedException();
            return null;
          }
          if (explicit && current.uploadedById !== actorId) throw new UnauthorizedException();
          if (
            expiredBefore &&
            (!['pending', 'failed'].includes(current.status) || current.createdAt >= expiredBefore)
          ) {
            return null;
          }
          if (current.status === 'deleted') return current.storageKey;

          const [references, covers, avatars] = await Promise.all([
            tx.pageAsset.count({ where: { assetId } }),
            tx.page.count({ where: { coverAssetId: assetId } }),
            tx.userProfile.count({ where: { avatarAssetId: assetId } }),
          ]);
          // #52 adds its active snapshot reference to this retention check.
          if (references + covers + avatars > 0)
            throw new ConflictException('Asset is still in use');
          if (current.status === 'ready') {
            for (const pageId of pageIds) {
              const [document, projection] = await Promise.all([
                tx.pageDocument.findUnique({
                  where: { pageId },
                  select: { storageRevision: true, updatedAt: true },
                }),
                tx.pageAssetProjection.findUnique({
                  where: { pageId },
                  select: { sourceStorageRevision: true },
                }),
              ]);
              if (
                !document ||
                !projection ||
                document.storageRevision !== projection.sourceStorageRevision
              ) {
                if (
                  document &&
                  Date.now() - document.updatedAt.getTime() >=
                    this.config.assets.projectionStaleWarningSeconds * 1_000
                ) {
                  this.logger.warn(
                    `Asset GC deferred for stale page projection ${pageId} at revision ${document.storageRevision}`,
                  );
                }
                throw new StalePageProjectionError(
                  `Asset page projection is stale for page ${pageId}`,
                );
              }
            }
          }
          await tx.asset.update({
            where: { id: assetId },
            data: { status: 'deleted', deletedAt: new Date() },
          });
          await tx.pageAssetGrant.deleteMany({ where: { assetId } });
          return current.storageKey;
        });
        break;
      } catch (error) {
        if (error instanceof GrantSetChangedError && attempt < 2) continue;
        if (error instanceof GrantSetChangedError) {
          throw new Error('Asset grant set changed during GC');
        }
        throw error;
      }
    }
    if (deletedKey) await this.deleteObjectIfTombstoned(assetId, deletedKey);
  }

  private async deleteObjectIfTombstoned(assetId: string, storageKey: string): Promise<void> {
    try {
      const current = await this.prisma.asset.findUnique({
        where: { id: assetId },
        select: { status: true, storageKey: true },
      });
      if (current?.status === 'deleted' && current.storageKey === storageKey) {
        await this.storage.deleteObject(storageKey);
      }
    } catch (error) {
      this.logger.warn(
        `Physical asset deletion deferred for ${assetId}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }
}
