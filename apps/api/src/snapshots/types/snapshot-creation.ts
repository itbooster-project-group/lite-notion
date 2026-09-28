import type { SnapshotReason as SnapshotReasonType } from '../../generated/prisma/enums';
import { SnapshotReason } from '../../generated/prisma/enums';
import type { CapturedDocumentState } from './captured-document-state';

export type SystemSnapshotReason = Exclude<SnapshotReasonType, typeof SnapshotReason.manual>;

export interface CreateManualSnapshotInput extends CapturedDocumentState {
  pageId: string;
  createdById: string;
}

export interface CreateInternalSnapshotInput extends CapturedDocumentState {
  pageId: string;
  createdById: string | null;
  reason: SystemSnapshotReason;
}
