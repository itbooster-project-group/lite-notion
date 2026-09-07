import { forwardRef, Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProjectsModule } from '../projects/projects.module';
import { PageDocumentModule } from './page-document/page-document.module';
import { PagesController } from './pages.controller';
import { PagesRepository, PrismaPagesRepository } from './pages.repository';
import { PagesService } from './pages.service';
import { CreatePageUseCase } from './use-cases/create-page.use-case';
import { MovePageUseCase } from './use-cases/move-page.use-case';
import { PurgePageUseCase } from './use-cases/purge-page.use-case';
import { PurgePagesTrashUseCase } from './use-cases/purge-pages-trash.use-case';
import { RestorePageUseCase } from './use-cases/restore-page.use-case';
import { SoftDeletePageUseCase } from './use-cases/soft-delete-page.use-case';

const useCases = [
  CreatePageUseCase,
  MovePageUseCase,
  PurgePageUseCase,
  PurgePagesTrashUseCase,
  RestorePageUseCase,
  SoftDeletePageUseCase,
];

@Module({
  controllers: [PagesController],
  // Наружу отдаётся только сервис; юзкейсы приватны модулю.
  exports: [PagesRepository, PagesService],
  imports: [DatabaseModule, forwardRef(() => ProjectsModule), PageDocumentModule],
  providers: [
    PagesService,
    { provide: PagesRepository, useClass: PrismaPagesRepository },
    ...useCases,
  ],
})
export class PagesModule {}
