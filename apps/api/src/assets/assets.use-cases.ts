import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { PrismaService } from '../database/prisma.service';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { OBJECT_STORAGE, type ObjectStorage } from './storage/object-storage';

@Injectable()
export class AssetsUseCases {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  async metadataForPage(actorId: string, assetId: string, pageId: string) {
    const role = await this.permissions.requireRole(actorId, pageId, PageRole.VIEWER);
    const [asset, grant, reference, cover] = await Promise.all([
      this.prisma.asset.findUnique({ where: { id: assetId } }),
      this.prisma.pageAssetGrant.findUnique({ where: { pageId_assetId: { pageId, assetId } } }),
      this.prisma.pageAsset.findFirst({ where: { pageId, assetId } }),
      this.prisma.page.findFirst({ where: { id: pageId, coverAssetId: assetId } }),
    ]);
    const editor = role !== PageRole.VIEWER;
    if (asset?.status !== 'ready' || !grant || (!reference && !cover && !editor))
      throw new UnauthorizedException();
    if (reference && !cover) {
      await this.assertPageProjectionFresh(pageId);
    }
    return this.metadata(asset);
  }

  async readUrlForPage(actorId: string, assetId: string, pageId: string) {
    const asset = await this.metadataForPage(actorId, assetId, pageId);
    const stored = await this.prisma.pageAssetProjection.findUnique({ where: { pageId } });
    const document = await this.prisma.pageDocument.findUnique({
      where: { pageId },
      select: { storageRevision: true },
    });
    const isCover = await this.prisma.page.findFirst({
      where: { id: pageId, coverAssetId: assetId },
    });
    const reference = await this.prisma.pageAsset.findFirst({ where: { pageId, assetId } });
    if (
      !isCover &&
      reference !== null &&
      (!stored || !document || stored.sourceStorageRevision !== document.storageRevision)
    ) {
      throw new UnauthorizedException();
    }
    const record = await this.prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    return {
      url: await this.storage.signedReadUrl(
        record.storageKey,
        this.config.assets.readUrlTtlSeconds,
      ),
      expiresInSeconds: this.config.assets.readUrlTtlSeconds,
      asset,
    };
  }

  async grant(actorId: string, pageId: string, assetId: string) {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "pageId" FROM "PageDocument" WHERE "pageId" = ${pageId}::uuid FOR UPDATE`;
      await this.assertPageProjectionFresh(pageId, tx);
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId}::uuid FOR UPDATE`;
      const asset = await tx.asset.findFirst({
        where: { id: assetId, uploadedById: actorId, status: 'ready' },
      });
      if (!asset) throw new UnauthorizedException();
      await tx.pageAssetGrant.upsert({
        where: { pageId_assetId: { pageId, assetId } },
        create: { pageId, assetId },
        update: {},
      });
    });
  }

  async setCover(actorId: string, pageId: string, assetId: string | null): Promise<void> {
    await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "pageId" FROM "PageDocument" WHERE "pageId" = ${pageId}::uuid FOR UPDATE`;
      await this.assertPageProjectionFresh(pageId, tx);
      if (assetId) {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId}::uuid FOR UPDATE`;
        const [asset, grant] = await Promise.all([
          tx.asset.findFirst({ where: { id: assetId, status: 'ready' }, select: { id: true } }),
          tx.pageAssetGrant.findUnique({ where: { pageId_assetId: { pageId, assetId } } }),
        ]);
        if (!asset || !grant) throw new UnauthorizedException();
      }
      await tx.page.update({ where: { id: pageId }, data: { coverAssetId: assetId } });
    });
  }

  async setAvatar(actorId: string, assetId: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (assetId) {
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId}::uuid FOR UPDATE`;
        const asset = await tx.asset.findFirst({
          where: { id: assetId, uploadedById: actorId, status: 'ready' },
          select: { id: true },
        });
        if (!asset) throw new UnauthorizedException();
      }
      await tx.userProfile.upsert({
        where: { userId: actorId },
        create: { userId: actorId, avatarAssetId: assetId },
        update: { avatarAssetId: assetId },
      });
    });
  }

  async readUrlForAvatar(assetId: string, userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, status: 'ready' } });
    if (!profile || profile.avatarAssetId !== assetId || !asset) throw new UnauthorizedException();
    return {
      url: await this.storage.signedReadUrl(asset.storageKey, this.config.assets.readUrlTtlSeconds),
      expiresInSeconds: this.config.assets.readUrlTtlSeconds,
    };
  }

  private metadata(asset: {
    id: string;
    status: string;
    mimeType: string | null;
    sizeBytes: bigint | null;
    originalName: string;
  }) {
    return {
      id: asset.id,
      status: asset.status,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
      originalName: asset.originalName,
    };
  }

  private async assertPageProjectionFresh(
    pageId: string,
    database: Pick<PrismaService, 'pageDocument' | 'pageAssetProjection'> = this.prisma,
  ): Promise<void> {
    const [document, projection] = await Promise.all([
      database.pageDocument.findUnique({ where: { pageId }, select: { storageRevision: true } }),
      database.pageAssetProjection.findUnique({
        where: { pageId },
        select: { sourceStorageRevision: true },
      }),
    ]);
    if (!document || !projection || document.storageRevision !== projection.sourceStorageRevision) {
      throw new UnauthorizedException();
    }
  }
}
