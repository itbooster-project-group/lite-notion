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
export class AssetUploadUseCases {
  private activeUploads = 0;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PagePermissionsService) private readonly permissions: PagePermissionsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(applicationConfig.KEY) private readonly config: ApplicationConfig,
  ) {}

  async initiate(actorId: string, pageId: string | undefined, fileName: string) {
    if (pageId) await this.permissions.requireRole(actorId, pageId, PageRole.EDITOR);
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
      const contentType = request.headers['content-type']?.split(';')[0]?.trim();
      if (!mimeType || (contentType !== 'application/octet-stream' && contentType !== mimeType)) {
        if (!isUploadAttemptKey(asset.storageKey)) {
          await this.prisma.asset.updateMany({
            where: {
              id: assetId,
              uploadedById: actorId,
              status: 'pending',
              storageKey: asset.storageKey,
            },
            data: { status: 'failed' },
          });
        }
        throw new UnsupportedMediaTypeException('Unsupported or mismatched image content');
      }
      const attemptKey = `assets/${assetId}/attempt-${randomUUID()}`;
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
      const checksum = await hashFile(filePath);
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

function isUploadAttemptKey(key: string): boolean {
  return key.includes('/attempt-');
}
