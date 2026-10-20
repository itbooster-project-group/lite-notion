import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';
import type { AssetStatus } from '../generated/prisma/enums';

export interface PublicationAssetRecord {
  id: string;
  status: AssetStatus;
}

/** Data access for asset rows and page grants used by publication writes. */
@Injectable()
export abstract class AssetsRepository {
  abstract bind(scope: TransactionScope): AssetsRepository;

  /** Locks existing assets in UUID order until the caller's transaction completes. */
  abstract lockForPublication(assetIds: readonly string[]): Promise<void>;

  abstract findPublicationAssets(assetIds: readonly string[]): Promise<PublicationAssetRecord[]>;

  abstract findPublicationGrants(pageId: string, assetIds: readonly string[]): Promise<string[]>;
}

@Injectable()
export class PrismaAssetsRepository extends AssetsRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaAssetsRepository {
    return new PrismaAssetsRepository(databaseClientOf(scope));
  }

  async lockForPublication(assetIds: readonly string[]): Promise<void> {
    if (assetIds.length === 0) return;
    const sortedIds = [...new Set(assetIds)].sort();
    await this.client.$queryRaw`
      SELECT "id" FROM "Asset"
      WHERE "id" = ANY(${sortedIds}::uuid[])
      ORDER BY "id" ASC FOR UPDATE
    `;
  }

  findPublicationAssets(assetIds: readonly string[]): Promise<PublicationAssetRecord[]> {
    if (assetIds.length === 0) return Promise.resolve([]);
    return this.client.asset.findMany({
      select: { id: true, status: true },
      where: { id: { in: [...assetIds] } },
    });
  }

  async findPublicationGrants(pageId: string, assetIds: readonly string[]): Promise<string[]> {
    if (assetIds.length === 0) return [];
    const grants = await this.client.pageAssetGrant.findMany({
      select: { assetId: true },
      where: { assetId: { in: [...assetIds] }, pageId },
    });
    return grants.map(({ assetId }) => assetId);
  }
}
