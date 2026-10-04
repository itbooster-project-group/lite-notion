import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { SnapshotApplicationService } from './snapshot-application.service';
import { SnapshotsModule } from './snapshots.module';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotInternalUseCase } from './use-cases/create-snapshot-internal.use-case';
import { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';

describe('SnapshotsModule', () => {
  it('exports the internal creation use case, metadata read service, and application service', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SnapshotsModule) as unknown[];

    expect(exports).toContain(CreateSnapshotInternalUseCase);
    expect(exports).toContain(SnapshotsService);
    expect(exports).toContain(SnapshotApplicationService);
    expect(exports).not.toContain(CreateSnapshotManualUseCase);
  });

  it('registers both creation use cases inside the module', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, SnapshotsModule) as unknown[];

    expect(providers).toContain(CreateSnapshotInternalUseCase);
    expect(providers).toContain(CreateSnapshotManualUseCase);
  });
});
