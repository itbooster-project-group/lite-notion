import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { PageDocumentController } from './page-document.controller';
import { PageDocumentRepository, PrismaPageDocumentRepository } from './page-document.repository';
import { PageDocumentService } from './page-document.service';

/**
 * Подмодуль владеет своей таблицей и правами на неё: и то, и другое проверяется
 * условием запроса через связь с `Page`. Сервис экспортируется — `PagesModule`
 * создаёт им пустой документ в транзакции создания страницы.
 */
@Module({
  controllers: [PageDocumentController],
  exports: [PageDocumentRepository, PageDocumentService],
  imports: [DatabaseModule],
  providers: [
    PageDocumentService,
    { provide: PageDocumentRepository, useClass: PrismaPageDocumentRepository },
  ],
})
export class PageDocumentModule {}
