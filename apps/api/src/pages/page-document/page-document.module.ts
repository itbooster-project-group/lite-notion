import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { PagePermissionsModule } from '../../page-permissions/page-permissions.module';
import { PageDocumentController } from './page-document.controller';
import { PageDocumentRepository, PrismaPageDocumentRepository } from './page-document.repository';
import { PageDocumentService } from './page-document.service';

/**
 * Подмодуль владеет своей таблицей, но не правами на неё: доступ к документу — это
 * доступ к его странице, и решает его `PagePermissionsModule`. Живость строки
 * по-прежнему проверяется условием запроса через связь с `Page`. Сервис
 * экспортируется — `PagesModule` создаёт им пустой документ в транзакции создания.
 */
@Module({
  controllers: [PageDocumentController],
  exports: [PageDocumentRepository, PageDocumentService],
  imports: [DatabaseModule, PagePermissionsModule],
  providers: [
    PageDocumentService,
    { provide: PageDocumentRepository, useClass: PrismaPageDocumentRepository },
  ],
})
export class PageDocumentModule {}
