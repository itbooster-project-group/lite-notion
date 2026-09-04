import { forwardRef, Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PagesModule } from '../pages/pages.module';
import { ProjectsController } from './projects.controller';
import { PrismaProjectsRepository, ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';
import { PurgeProjectUseCase } from './use-cases/purge-project.use-case';
import { PurgeProjectsTrashUseCase } from './use-cases/purge-projects-trash.use-case';
import { RestoreProjectUseCase } from './use-cases/restore-project.use-case';
import { SoftDeleteProjectUseCase } from './use-cases/soft-delete-project.use-case';

const useCases = [
  PurgeProjectUseCase,
  PurgeProjectsTrashUseCase,
  RestoreProjectUseCase,
  SoftDeleteProjectUseCase,
];

@Module({
  controllers: [ProjectsController],
  exports: [ProjectsRepository, ProjectsService],
  imports: [DatabaseModule, forwardRef(() => PagesModule)],
  providers: [
    ProjectsService,
    { provide: ProjectsRepository, useClass: PrismaProjectsRepository },
    ...useCases,
  ],
})
export class ProjectsModule {}
