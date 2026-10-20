import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStorage } from '../assets/storage/object-storage';
import { PrismaService } from '../database/prisma.service';
import type { PagePublicationStatus } from '../generated/prisma/enums';
import { publicationPath, resolverPath } from './helpers';
import { PublicationNotFoundError } from './publication-errors';

export interface PublicationManagementView {
  status: PagePublicationStatus;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: Date | null;
  publicPath: string | null;
}

export interface PublicAssetDescriptor {
  assetId: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  resolverPath: string;
}

export interface PublicPublicationView {
  title: string;
  seoTitle: string;
  seoDescription: string | null;
  schemaVersion: number;
  contentJson: unknown;
  assets: PublicAssetDescriptor[];
  cover: PublicAssetDescriptor | null;
}

@Injectable()
export class PublicationsReadService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async getManagement(pageId: string): Promise<PublicationManagementView> {
    const publication = await this.prisma.pagePublication.findFirst({
      select: {
        publishedAt: true,
        seoDescription: true,
        seoTitle: true,
        slug: true,
        status: true,
      },
      where: {
        page: { deletedAt: null, project: { deletedAt: null } },
        pageId,
      },
    });
    if (!publication) throw new PublicationNotFoundError();
    return {
      ...publication,
      publicPath: publication.status === 'published' ? publicationPath(publication.slug) : null,
    };
  }

  async getPublic(slug: string): Promise<PublicPublicationView | null> {
    const publication = await this.prisma.pagePublication.findFirst({
      select: {
        seoDescription: true,
        seoTitle: true,
        slug: true,
        snapshot: {
          select: {
            assets: {
              orderBy: [{ assetId: 'asc' }, { nodeId: 'asc' }],
              select: {
                asset: {
                  select: { height: true, id: true, mimeType: true, status: true, width: true },
                },
                assetId: true,
              },
            },
            rendering: {
              select: {
                contentJson: true,
                coverAsset: {
                  select: { height: true, id: true, mimeType: true, status: true, width: true },
                },
                coverAssetId: true,
                pageTitle: true,
                tiptapSchemaVersion: true,
              },
            },
          },
        },
      },
      where: {
        page: { deletedAt: null, project: { deletedAt: null } },
        slug,
        status: 'published',
      },
    });
    const snapshot = publication?.snapshot;
    const rendering = snapshot?.rendering;
    if (!publication || !snapshot || !rendering) return null;
    if (snapshot.assets.some(({ asset }) => asset.status !== 'ready' || !asset.mimeType))
      return null;
    if (
      rendering.coverAssetId &&
      (rendering.coverAsset?.status !== 'ready' || !rendering.coverAsset.mimeType)
    ) {
      return null;
    }

    const uniqueAssets = new Map(snapshot.assets.map(({ asset }) => [asset.id, asset]));
    const assets = [...uniqueAssets.values()].map((asset) =>
      this.descriptor(publication.slug, asset),
    );
    const cover = rendering.coverAsset
      ? this.descriptor(publication.slug, rendering.coverAsset)
      : null;
    return {
      assets,
      contentJson: rendering.contentJson,
      cover,
      schemaVersion: rendering.tiptapSchemaVersion,
      seoDescription: publication.seoDescription,
      seoTitle: publication.seoTitle ?? rendering.pageTitle,
      title: rendering.pageTitle,
    };
  }

  async resolveAsset(slug: string, assetId: string): Promise<string | null> {
    const publication = await this.prisma.pagePublication.findFirst({
      select: {
        snapshot: {
          select: {
            assets: {
              select: {
                asset: { select: { status: true, storageKey: true } },
                assetId: true,
              },
              where: { assetId },
            },
            rendering: {
              select: {
                coverAsset: { select: { status: true, storageKey: true } },
                coverAssetId: true,
              },
            },
          },
        },
      },
      where: {
        page: { deletedAt: null, project: { deletedAt: null } },
        slug,
        status: 'published',
      },
    });
    const snapshot = publication?.snapshot;
    if (!snapshot?.rendering) return null;
    const coverAsset =
      snapshot.rendering.coverAssetId === assetId ? snapshot.rendering.coverAsset : null;
    const contentAsset = snapshot.assets.find((asset) => asset.assetId === assetId)?.asset;
    const asset = coverAsset ?? contentAsset;
    if (asset?.status !== 'ready') return null;
    return this.storage.signedReadUrl(asset.storageKey, 60);
  }

  private descriptor(
    slug: string,
    asset: { height: number | null; id: string; mimeType: string | null; width: number | null },
  ): PublicAssetDescriptor {
    return {
      assetId: asset.id,
      height: asset.height,
      mimeType: asset.mimeType as string,
      resolverPath: resolverPath(slug, asset.id),
      width: asset.width,
    };
  }
}
