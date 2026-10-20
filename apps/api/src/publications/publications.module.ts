import { forwardRef, Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { DatabaseModule } from '../database/database.module';
import { DocumentCaptureModule } from '../document-capture/document-capture.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PagesModule } from '../pages/pages.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { PublicPublicationsController } from './public-publications.controller';
import { PublicationManagementService } from './publication-management.service';
import { PublicationRevalidationScheduler } from './publication-revalidation.scheduler';
import { PublicationVersionPersistence } from './publication-version.persistence';
import { PublicationsController } from './publications.controller';
import { PrismaPublicationsRepository, PublicationsRepository } from './publications.repository';
import { PublicationsReadService } from './publications-read.service';
import { DeliverPublicationRevalidationUseCase } from './use-cases/deliver-publication-revalidation.use-case';
import { PublishPageUseCase } from './use-cases/publish-page.use-case';
import { RepublishPageUseCase } from './use-cases/republish-page.use-case';
import { UnpublishPageUseCase } from './use-cases/unpublish-page.use-case';
import { UpdatePublicationMetadataUseCase } from './use-cases/update-publication-metadata.use-case';

@Module({
  controllers: [PublicationsController, PublicPublicationsController],
  exports: [PublicationsRepository],
  imports: [
    AssetsModule,
    DatabaseModule,
    DocumentCaptureModule,
    PagePermissionsModule,
    forwardRef(() => PagesModule),
    SnapshotsModule,
  ],
  providers: [
    PublicationManagementService,
    PublicationsReadService,
    PublicationVersionPersistence,
    PublicationRevalidationScheduler,
    DeliverPublicationRevalidationUseCase,
    PublishPageUseCase,
    RepublishPageUseCase,
    UnpublishPageUseCase,
    UpdatePublicationMetadataUseCase,
    { provide: PublicationsRepository, useClass: PrismaPublicationsRepository },
  ],
})
export class PublicationsModule {}
