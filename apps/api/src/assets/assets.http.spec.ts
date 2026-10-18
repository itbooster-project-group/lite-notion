import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationConfig } from '../config/application-config';
import { AssetGcUseCases } from './asset-gc.use-cases';
import { AssetUploadUseCases } from './asset-upload.use-cases';
import { AssetsController } from './assets.controller';
import { AssetsUseCases } from './assets.use-cases';
import { InMemoryObjectStorage } from './storage/in-memory-object-storage';

const actorId = '550e8400-e29b-41d4-a716-446655440000';
const assetId = '550e8400-e29b-41d4-a716-446655440001';
const storageKey = `assets/${assetId}/550e8400-e29b-41d4-a716-446655440002`;

describe('asset upload HTTP contract', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('accepts binary image bytes with the documented octet-stream content type', async () => {
    const asset = {
      id: assetId,
      uploadedById: actorId,
      originalName: 'image.png',
      storageKey,
      status: 'pending',
      mimeType: null as string | null,
      sizeBytes: null as bigint | null,
      checksum: null as string | null,
    };
    const prisma = {
      asset: {
        findUnique: vi.fn(async () => asset),
        findUniqueOrThrow: vi.fn(async () => asset),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { status: string; storageKey: string };
            data: Partial<typeof asset>;
          }) => {
            if (asset.status !== where.status || asset.storageKey !== where.storageKey) {
              return { count: 0 };
            }
            Object.assign(asset, data);
            return { count: 1 };
          },
        ),
      },
      pageAssetGrant: { findMany: vi.fn(async () => []) },
    };
    const storage = new InMemoryObjectStorage();
    const useCases = new AssetUploadUseCases(
      prisma as never,
      { requireRole: vi.fn() } as never,
      storage,
      {
        assets: {
          maxConcurrentUploads: 2,
          maxUploadBytes: 10 * 1024 * 1024,
          uploadTimeoutMs: 5_000,
          readUrlTtlSeconds: 60,
        },
      } as ApplicationConfig,
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [
        { provide: AssetsUseCases, useValue: {} },
        { provide: AssetUploadUseCases, useValue: useCases },
        { provide: AssetGcUseCases, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use((incomingRequest: Request, _response: Response, next: NextFunction) => {
      (incomingRequest as Request & { user: { id: string; sessionId: string } }).user = {
        id: actorId,
        sessionId: '550e8400-e29b-41d4-a716-446655440003',
      };
      next();
    });
    app.setGlobalPrefix('api/v1');
    await app.init();

    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await request(app.getHttpServer())
      .put(`/api/v1/assets/${assetId}/content`)
      .set('content-type', 'application/octet-stream')
      .send(bytes)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ id: assetId, status: 'ready', mimeType: 'image/png' });
      });
    expect(asset.status).toBe('ready');
  });
});
