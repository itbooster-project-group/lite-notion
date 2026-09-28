import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PagesModule } from '../pages/pages.module';
import { PrismaSnapshotsRepository, SnapshotsRepository } from './snapshots.repository';
import { SnapshotsService } from './snapshots.service';
import { CreateSnapshotUseCase } from './use-cases/create-snapshot.use-case';

@Module({
  exports: [SnapshotsService],
  imports: [DatabaseModule, PagePermissionsModule, PagesModule],
  providers: [
    CreateSnapshotUseCase,
    SnapshotsService,
    { provide: SnapshotsRepository, useClass: PrismaSnapshotsRepository },
  ],
})
export class SnapshotsModule {}
