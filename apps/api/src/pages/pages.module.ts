import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProjectsModule } from '../projects/projects.module';
import { PagesController } from './pages.controller';
import { PagesRepository, PrismaPagesRepository } from './pages.repository';
import { PagesService } from './pages.service';

@Module({
  controllers: [PagesController],
  // Наружу отдаётся только сервис: правила дерева — владелец, проект, цикл,
  // порядок — живут в нём, и зависимый `PageDocumentModule` обязан спрашивать
  // их через него, а не ходить в модель данных напрямую.
  exports: [PagesService],
  imports: [DatabaseModule, ProjectsModule],
  providers: [PagesService, { provide: PagesRepository, useClass: PrismaPagesRepository }],
})
export class PagesModule {}
