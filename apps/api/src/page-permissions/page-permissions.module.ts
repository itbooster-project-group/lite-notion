import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { PagePermissionsController } from './page-permissions.controller';
import {
  PagePermissionsRepository,
  PrismaPagePermissionsRepository,
} from './page-permissions.repository';
import { PagePermissionsService } from './page-permissions.service';

/**
 * Зависимость односторонняя: `PagesModule` и `PageDocumentModule` импортируют этот
 * модуль, обратной связи нет. Поэтому репозиторий читает страницы сам, а не через
 * `PagesRepository`, и `forwardRef` здесь не нужен.
 */
@Module({
  controllers: [PagePermissionsController],
  exports: [PagePermissionsRepository, PagePermissionsService],
  imports: [DatabaseModule, UsersModule],
  providers: [
    PagePermissionsService,
    { provide: PagePermissionsRepository, useClass: PrismaPagePermissionsRepository },
  ],
})
export class PagePermissionsModule {}
