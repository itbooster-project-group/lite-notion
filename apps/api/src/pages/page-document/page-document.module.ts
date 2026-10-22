import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { PagePermissionsModule } from '../../page-permissions/page-permissions.module';
import { PageDocumentRepository, PrismaPageDocumentRepository } from './page-document.repository';
import { PageDocumentService } from './page-document.service';
import {
  PageSearchProjectionRepository,
  PrismaPageSearchProjectionRepository,
} from './page-search-projection.repository';
import { ProjectionRetryScheduler } from './projection-retry.scheduler';
import { SearchProjectionRetryScheduler } from './search-projection-retry.scheduler';
import { PersistPageDocumentStateUseCase } from './use-cases/persist-page-document-state.use-case';
import { ProjectPageAssetsUseCase } from './use-cases/project-page-assets.use-case';
import { ProjectPageSearchUseCase } from './use-cases/project-page-search.use-case';

/**
 * Публичных маршрутов у документа нет: содержимое меняет только collaboration
 * runtime через внутренние операции. Сервис экспортируется — `PagesModule` создаёт
 * им пустой документ в транзакции создания, `InternalModule` читает и пишет.
 */
@Module({
  exports: [
    PageDocumentRepository,
    PageDocumentService,
    PersistPageDocumentStateUseCase,
    ProjectPageSearchUseCase,
  ],
  imports: [DatabaseModule, PagePermissionsModule],
  providers: [
    PageDocumentService,
    PersistPageDocumentStateUseCase,
    ProjectPageAssetsUseCase,
    ProjectPageSearchUseCase,
    ProjectionRetryScheduler,
    SearchProjectionRetryScheduler,
    { provide: PageDocumentRepository, useClass: PrismaPageDocumentRepository },
    {
      provide: PageSearchProjectionRepository,
      useClass: PrismaPageSearchProjectionRepository,
    },
  ],
})
export class PageDocumentModule {}
