import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PagesModule } from '../pages/pages.module';
import { DocumentCaptureClient } from './document-capture.client';
import { SnapshotApplicationService } from './snapshot-application.service';
import { PrismaSnapshotsRepository, SnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotUseCase } from './use-cases/create-snapshot.use-case';

@Module({
  exports: [SnapshotApplicationService, SnapshotsService],
  imports: [DatabaseModule, PagePermissionsModule, PagesModule],
  providers: [
    CreateSnapshotUseCase,
    DocumentCaptureClient,
    SnapshotApplicationService,
    SnapshotsService,
    { provide: SnapshotsRepository, useClass: PrismaSnapshotsRepository },
  ],
})
export class SnapshotsModule {}
