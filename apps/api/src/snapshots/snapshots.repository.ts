import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  type DatabaseClient,
  databaseClientOf,
  type TransactionScope,
} from '../database/transaction';
import type { SnapshotReason } from '../generated/prisma/enums';
import type { SnapshotMetadata } from './types/snapshot-metadata';

export interface InsertSnapshotInput {
  pageId: string;
  createdById: string | null;
  revision: bigint;
  sourceStorageRevision: bigint;
  tiptapSchemaVersion: number;
  yjsState: Uint8Array<ArrayBuffer>;
  reason: SnapshotReason;
}

const SNAPSHOT_METADATA_SELECT = {
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  id: true,
  reason: true,
  revision: true,
  sourceStorageRevision: true,
  tiptapSchemaVersion: true,
} as const;

@Injectable()
export abstract class SnapshotsRepository {
  abstract bind(scope: TransactionScope): SnapshotsRepository;

  abstract findLatestRevision(pageId: string): Promise<bigint | null>;

  abstract insert(input: InsertSnapshotInput): Promise<SnapshotMetadata>;

  abstract listMetadataByPage(pageId: string): Promise<SnapshotMetadata[]>;

  abstract findMetadataByPageAndId(
    pageId: string,
    snapshotId: string,
  ): Promise<SnapshotMetadata | null>;
}

@Injectable()
export class PrismaSnapshotsRepository extends SnapshotsRepository {
  constructor(@Inject(PrismaService) private readonly client: DatabaseClient) {
    super();
  }

  bind(scope: TransactionScope): PrismaSnapshotsRepository {
    return new PrismaSnapshotsRepository(databaseClientOf(scope));
  }

  async findLatestRevision(pageId: string): Promise<bigint | null> {
    const latest = await this.client.documentSnapshot.findFirst({
      orderBy: { revision: 'desc' },
      select: { revision: true },
      where: { pageId },
    });

    return latest?.revision ?? null;
  }

  insert(input: InsertSnapshotInput): Promise<SnapshotMetadata> {
    return this.client.documentSnapshot.create({
      data: input,
      select: SNAPSHOT_METADATA_SELECT,
    });
  }

  listMetadataByPage(pageId: string): Promise<SnapshotMetadata[]> {
    return this.client.documentSnapshot.findMany({
      orderBy: { revision: 'desc' },
      select: SNAPSHOT_METADATA_SELECT,
      where: { pageId },
    });
  }

  findMetadataByPageAndId(pageId: string, snapshotId: string): Promise<SnapshotMetadata | null> {
    return this.client.documentSnapshot.findFirst({
      select: SNAPSHOT_METADATA_SELECT,
      where: { id: snapshotId, pageId },
    });
  }
}
