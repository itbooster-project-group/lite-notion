import type { SnapshotReason } from '../../generated/prisma/enums';

export interface SnapshotCreatorMetadata {
  id: string;
  name: string;
}

export interface SnapshotMetadata {
  id: string;
  revision: bigint;
  reason: SnapshotReason;
  createdAt: Date;
  createdBy: SnapshotCreatorMetadata | null;
  sourceStorageRevision: bigint;
  tiptapSchemaVersion: number;
}
