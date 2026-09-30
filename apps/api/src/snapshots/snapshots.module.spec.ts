import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { SnapshotApplicationService } from './snapshot-application.service';
import { SnapshotsModule } from './snapshots.module';
import { SnapshotsService } from './snapshots.service';

describe('SnapshotsModule', () => {
  it('exports SnapshotsService for importing internal use cases', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SnapshotsModule) as unknown[];

    expect(exports).toContain(SnapshotsService);
    expect(exports).toContain(SnapshotApplicationService);
  });
});
