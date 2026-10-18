import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { type ApplicationConfig, applicationConfig } from '../config/application-config';
import { PrismaService } from '../database/prisma.service';
import { PageRole } from '../page-permissions/constants';
import { PagePermissionsService } from '../page-permissions/page-permissions.service';
import { assertStorageKey, OBJECT_STORAGE, type ObjectStorage } from './storage/object-storage';

@Injectable()
export class AssetsUseCases {
  private activeUploads = 0;
  private readonly logger = new Logger(AssetsUseCases.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  async initiate(actorId: string, pageId: string | undefined, fileName: string) {
    if (pageId) {
      await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
    }
    const id = randomUUID();
    const name = sanitizeFileName(fileName);
    const storageKey = `assets/${id}/${randomUUID()}`;
    const asset = await this.prisma.$transaction(async (tx) => {
      if (pageId) {
        await tx.$queryRaw`SELECT "pageId" FROM "PageDocument" WHERE "pageId" = ${pageId}::uuid FOR UPDATE`;
        await this.assertPageProjectionFresh(pageId, tx);
      }
      const created = await tx.asset.create({
        data: { id, uploadedById: actorId, storageKey, originalName: name },
      });
      if (pageId) await tx.pageAssetGrant.create({ data: { pageId, assetId: id } });
      else
        await tx.userProfile.upsert({
          where: { userId: actorId },
          create: { userId: actorId },
          update: {},
        });
      return created;
    });
    return { assetId: asset.id, contentPath: `/api/v1/assets/${asset.id}/content` };
  }

  async upload(actorId: string, assetId: string, request: Request) {
    if (this.activeUploads >= this.config.assets.maxConcurrentUploads) {
      throw new ServiceUnavailableException('Asset upload capacity exceeded');
    }
    this.activeUploads += 1;
    let directory: string | null = null;
    try {
      directory = await mkdtemp(join(tmpdir(), 'lite-notion-asset-'));
      const filePath = join(directory, 'upload');
      const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
      if (!asset || asset.uploadedById !== actorId) throw new UnauthorizedException();
      if (asset.status !== 'pending')
        throw new ConflictException('Asset upload is no longer pending');
      const pageGrants = await this.prisma.pageAssetGrant.findMany({
        where: { assetId },
        select: { pageId: true },
      });
      for (const grant of pageGrants) {
        await this.permissions.requireRole(actorId, grant.pageId, PageRole.EDITOR);
      }
      const contentLength = request.headers['content-length'];
      if (
        contentLength &&
        (!/^\d+$/.test(contentLength) || Number(contentLength) > this.config.assets.maxUploadBytes)
      ) {
        throw new PayloadTooLargeException('Asset exceeds the upload size limit');
      }
      let sizeBytes = 0;
      const limiter = new Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          sizeBytes += chunk.length;
          callback(
            sizeBytes > this.config.assets.maxUploadBytes
              ? new PayloadTooLargeException('Asset exceeds the upload size limit')
              : null,
            chunk,
          );
        },
      });
      await pipeline(request, limiter, createWriteStream(filePath, { flags: 'wx', mode: 0o600 }), {
        signal: AbortSignal.timeout(this.config.assets.uploadTimeoutMs),
      });
      if (sizeBytes === 0) throw new BadRequestException('Asset file is empty');
      const file = await open(filePath, 'r');
      const header = Buffer.alloc(12);
      try {
        await file.read(header, 0, header.length, 0);
      } finally {
        await file.close();
      }
      const mimeType = detectMime(header);
      if (!mimeType || request.headers['content-type']?.split(';')[0]?.trim() !== mimeType) {
        await this.prisma.asset.updateMany({
          where: { id: assetId, status: 'pending' },
          data: { status: 'failed' },
        });
        throw new UnsupportedMediaTypeException('Unsupported or mismatched image content');
      }
      const checksum = await hashFile(filePath);
      const attemptKey = `assets/${assetId}/${randomUUID()}`;
      const claim = await this.prisma.asset.updateMany({
        where: {
          id: assetId,
          uploadedById: actorId,
          status: 'pending',
          storageKey: asset.storageKey,
        },
        data: { storageKey: attemptKey },
      });
      if (claim.count !== 1) throw new ConflictException('Asset upload attempt was superseded');
      assertStorageKey(attemptKey);
      await this.storage.putObject(attemptKey, {
        body: createReadStream(filePath),
        checksum,
        contentLength: sizeBytes,
        contentType: mimeType,
      });
      const stored = await this.storage.headObject(attemptKey);
      if (
        stored === null ||
        stored.sizeBytes !== sizeBytes ||
        stored.contentType !== mimeType ||
        (stored.checksum !== null && stored.checksum !== checksum)
      )
        throw new ServiceUnavailableException(
          'Stored object metadata does not match validated upload',
        );
      const updated = await this.prisma.asset.updateMany({
        where: { id: assetId, uploadedById: actorId, status: 'pending', storageKey: attemptKey },
        data: { status: 'ready', checksum, mimeType, sizeBytes: BigInt(sizeBytes) },
      });
      if (updated.count !== 1) throw new ConflictException('Asset upload attempt was superseded');
      return this.metadata(await this.prisma.asset.findUniqueOrThrow({ where: { id: assetId } }));
    } finally {
      this.activeUploads -= 1;
      if (directory !== null) await rm(directory, { recursive: true, force: true });
    }
  }

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

  async delete(actorId: string, assetId: string): Promise<void> {
    await this.markDeleted(actorId, assetId, true);
  }

  async reconcileDeletedAssets(): Promise<void> {
    const deleted = await this.prisma.asset.findMany({
      where: { status: 'deleted' },
      orderBy: { updatedAt: 'asc' },
      take: this.config.assets.gcBatchSize,
      select: { id: true, storageKey: true },
    });
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
        await this.markDeleted(asset.uploadedById, asset.id, false);
      } catch (error) {
        this.logger.warn(
          `Expired asset cleanup deferred for ${asset.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  async cleanupOrphanedObjects(): Promise<void> {
    const cutoff = Date.now() - this.config.assets.orphanGraceHours * 3_600_000;
    let continuationToken: string | undefined;
    do {
      const page = await this.storage.listObjects('assets/', continuationToken);
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
      continuationToken = page.continuationToken ?? undefined;
    } while (continuationToken !== undefined);
  }

  private async markDeleted(actorId: string, assetId: string, explicit: boolean): Promise<void> {
    let deletedKey: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
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
        if (pageIds.join(',') !== currentGrants.map(({ pageId }) => pageId).join(',')) continue;

        const current = await tx.asset.findUnique({ where: { id: assetId } });
        if (!current || (explicit && current.uploadedById !== actorId))
          throw new UnauthorizedException();
        if (current.status === 'deleted') {
          deletedKey = current.storageKey;
          return;
        }
        const [references, covers, avatars] = await Promise.all([
          tx.pageAsset.count({ where: { assetId } }),
          tx.page.count({ where: { coverAssetId: assetId } }),
          tx.userProfile.count({ where: { avatarAssetId: assetId } }),
        ]);
        if (references + covers + avatars > 0) throw new ConflictException('Asset is still in use');
        if (current.status === 'ready') {
          for (const pageId of pageIds) {
            const [document, projection] = await Promise.all([
              tx.pageDocument.findUnique({ where: { pageId }, select: { storageRevision: true } }),
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
              throw new Error(`Asset page projection is stale for page ${pageId}`);
            }
          }
        }
        await tx.asset.update({
          where: { id: assetId },
          data: { status: 'deleted', deletedAt: new Date() },
        });
        await tx.pageAssetGrant.deleteMany({ where: { assetId } });
        deletedKey = current.storageKey;
        return;
      }
      throw new Error('Asset grant set changed during GC');
    });
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

function sanitizeFileName(value: string): string {
  const sanitized = [...value]
    .filter((character) => character !== '/' && character !== '\\' && !/\p{Cc}/u.test(character))
    .join('')
    .trim()
    .slice(0, 255);
  return sanitized || 'image';
}

function detectMime(header: Buffer): string | null {
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (
    header.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    header.subarray(8, 12).toString() === 'WEBP'
  )
    return 'image/webp';
  return null;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
