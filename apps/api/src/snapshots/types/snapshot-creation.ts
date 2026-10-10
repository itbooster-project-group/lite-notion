import { CapturedDocumentState } from '../../document-capture/document-capture.client';
import type { SnapshotReason as SnapshotReasonType } from '../../generated/prisma/enums';
import { SnapshotReason } from '../../generated/prisma/enums';

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
