import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DocumentCaptureModule } from '../document-capture/document-capture.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PagesModule } from '../pages/pages.module';
import { PrismaSnapshotsRepository, SnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import { CreateCurrentManualSnapshotUseCase } from './use-cases/create-current-manual-snapshot.use-case';
import { CreateSnapshotInternalUseCase } from './use-cases/create-snapshot-internal.use-case';
import { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';

@Module({
  exports: [CreateCurrentManualSnapshotUseCase, CreateSnapshotInternalUseCase, SnapshotsService],
  imports: [DatabaseModule, DocumentCaptureModule, PagePermissionsModule, PagesModule],
  providers: [
    CreateSnapshotInternalUseCase,
    CreateSnapshotManualUseCase,
    CreateCurrentManualSnapshotUseCase,
    SnapshotsService,
    { provide: SnapshotsRepository, useClass: PrismaSnapshotsRepository },
  ],
})
export class SnapshotsModule {}
