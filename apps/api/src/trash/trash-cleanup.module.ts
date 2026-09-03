import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PrismaTrashCleanupRepository, TrashCleanupRepository } from './trash-cleanup.repository';
import { TrashCleanupService } from './trash-cleanup.service';

/**
 * Собственный модуль, а не часть `PagesModule` или `ProjectsModule`: задача
 * чистит обе таблицы, и положить её в один из модулей значило бы сделать второй
 * зависимым от первого. Зависит только от `DatabaseModule` — доменных правил у
 * физической очистки нет, и проходить ради неё через сервисы значило бы добавить
 * в них методы, не нужные ни одному маршруту.
 *
 * Наружу ничего не экспортирует: задача запускается по расписанию, вызывать её
 * из других модулей незачем.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    TrashCleanupService,
    { provide: TrashCleanupRepository, useClass: PrismaTrashCleanupRepository },
  ],
})
export class TrashCleanupModule {}
