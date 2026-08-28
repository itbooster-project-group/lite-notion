import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';
import { PrismaProjectsRepository, ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  exports: [ProjectsService],
  imports: [DatabaseModule],
  providers: [ProjectsService, { provide: ProjectsRepository, useClass: PrismaProjectsRepository }],
})
export class ProjectsModule {}
