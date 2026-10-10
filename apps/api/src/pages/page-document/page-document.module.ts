import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { PagePermissionsModule } from '../../page-permissions/page-permissions.module';
import { PageDocumentRepository, PrismaPageDocumentRepository } from './page-document.repository';
import { PageDocumentService } from './page-document.service';
import { PersistPageDocumentStateUseCase } from './use-cases/persist-page-document-state.use-case';

/**
 * Публичных маршрутов у документа нет: содержимое меняет только collaboration
 * runtime через внутренние операции. Сервис экспортируется — `PagesModule` создаёт
 * им пустой документ в транзакции создания, `InternalModule` читает и пишет.
 */
@Module({
  exports: [PageDocumentRepository, PageDocumentService, PersistPageDocumentStateUseCase],
  imports: [DatabaseModule, PagePermissionsModule],
  providers: [
    PageDocumentService,
    PersistPageDocumentStateUseCase,
    { provide: PageDocumentRepository, useClass: PrismaPageDocumentRepository },
  ],
})
export class PageDocumentModule {}
