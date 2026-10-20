import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { PublicPublicationsController } from './public-publications.controller';
import { PublicationsReadService } from './publications-read.service';

const assetId = '11111111-1111-4111-8111-111111111111';

describe('PublicPublicationsController', () => {
  it('returns a descriptor response without private fields or absolute origins', async () => {
    const publications = {
      getPublic: vi.fn(async () => ({
        assets: [
          {
            assetId,
            height: 480,
            mimeType: 'image/png',
            resolverPath: `/api/v1/public/publications/example/assets/${assetId}`,
            width: 640,
          },
        ],
        contentJson: { type: 'doc' },
        cover: null,
        schemaVersion: 2,
        seoDescription: null,
        seoTitle: 'Example',
        title: 'Example',
      })),
    } as unknown as PublicationsReadService;
    const controller = new PublicPublicationsController(publications);

    const response = await controller.get('example');

    expect(response).toMatchObject({
      assets: [{ assetId, resolverPath: `/api/v1/public/publications/example/assets/${assetId}` }],
      cover: null,
      schemaVersion: 2,
      title: 'Example',
    });
    expect(JSON.stringify(response)).not.toMatch(/storageKey|signed|https?:\/\//);
  });

  it('returns exactly a no-store 302 resolver response for an allowed current asset', async () => {
    const publications = {
      resolveAsset: vi.fn(async () => 'https://private-storage.example/signed?signature=secret'),
    } as unknown as PublicationsReadService;
    const controller = new PublicPublicationsController(publications);
    const response = {
      send: vi.fn(),
      set: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.resolveAsset('example', assetId, response);

    expect(publications.resolveAsset).toHaveBeenCalledWith('example', assetId);
    expect(response.status).toHaveBeenCalledWith(302);
    expect(response.set).toHaveBeenCalledWith({
      'Cache-Control': 'private, no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      Location: 'https://private-storage.example/signed?signature=secret',
    });
    expect(response.send).toHaveBeenCalledWith();
  });

  it('does not resolve an invalid or non-current asset', async () => {
    const publications = {
      resolveAsset: vi.fn(async () => null),
    } as unknown as PublicationsReadService;
    const controller = new PublicPublicationsController(publications);
    const response = {} as Response;

    await expect(controller.resolveAsset('example', 'not-an-id', response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.resolveAsset('example', assetId, response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(publications.resolveAsset).toHaveBeenCalledTimes(1);
  });
});
