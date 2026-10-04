import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PagesModule } from '../pages/pages.module';
import { PrismaSnapshotsRepository, SnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotInternalUseCase } from './use-cases/create-snapshot-internal.use-case';
import { CreateSnapshotManualUseCase } from './use-cases/create-snapshot-manual.use-case';

@Module({
  exports: [CreateSnapshotInternalUseCase, SnapshotsService],
  imports: [DatabaseModule, PagePermissionsModule, PagesModule],
  providers: [
    CreateSnapshotInternalUseCase,
    CreateSnapshotManualUseCase,
    SnapshotsService,
    { provide: SnapshotsRepository, useClass: PrismaSnapshotsRepository },
  ],
})
export class SnapshotsModule {}
