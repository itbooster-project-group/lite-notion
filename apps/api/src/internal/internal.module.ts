import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PagePermissionsModule } from '../page-permissions/page-permissions.module';
import { PageDocumentModule } from '../pages/page-document/page-document.module';
import { InternalController } from './internal.controller';

/**
 * Контроллер выведен из-под глобального префикса, из публикуемого OpenAPI и из
 * модели аутентификации публичных маршрутов. Логика — в доменных сервисах.
 */
@Module({
  controllers: [InternalController],
  imports: [AuthModule, PageDocumentModule, PagePermissionsModule],
})
export class InternalModule {}
