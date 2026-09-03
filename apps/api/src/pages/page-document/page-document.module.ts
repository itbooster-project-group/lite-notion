import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { PagesModule } from '../pages.module';
import { PageDocumentController } from './page-document.controller';
import { PageDocumentRepository, PrismaPageDocumentRepository } from './page-document.repository';
import { PageDocumentService } from './page-document.service';

/**
 * Зависимый подмодуль страниц. Своей таблицей владеет сам, а правило «страница
 * принадлежит вызывающему» берёт из `PagesService`: чужую модель данных модуль
 * не трогает и репозиторий страниц не получает.
 *
 * Зависимость направлена в одну сторону — сюда, а не отсюда: `PagesModule` про
 * документ не знает и его не импортирует, иначе получился бы цикл. Оба модуля
 * регистрируются в `AppModule` рядом.
 */
@Module({
  controllers: [PageDocumentController],
  imports: [DatabaseModule, PagesModule],
  providers: [
    PageDocumentService,
    { provide: PageDocumentRepository, useClass: PrismaPageDocumentRepository },
  ],
})
export class PageDocumentModule {}
