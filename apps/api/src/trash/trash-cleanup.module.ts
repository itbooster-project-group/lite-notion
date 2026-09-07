import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PrismaTrashCleanupRepository, TrashCleanupRepository } from './trash-cleanup.repository';
import { TrashCleanupService } from './trash-cleanup.service';

/**
 * Собственный модуль: задача чистит обе таблицы, и место в одном из модулей сделало
 * бы второй зависимым от первого. Доменных правил у физической очистки нет, поэтому
 * зависит только от `DatabaseModule` и наружу ничего не экспортирует.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    TrashCleanupService,
    { provide: TrashCleanupRepository, useClass: PrismaTrashCleanupRepository },
  ],
})
export class TrashCleanupModule {}
