import { Inject, Injectable } from '@nestjs/common';

import {
  type DeletedProjectRecord,
  type ProjectRecord,
  ProjectsRepository,
} from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(@Inject(ProjectsRepository) private readonly projects: ProjectsRepository) {}

  create(ownerId: string, name: string): Promise<ProjectRecord> {
    return this.projects.create({ name, ownerId });
  }

  listForOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.projects.findAllByOwner(ownerId);
  }

  listDeletedForOwner(ownerId: string): Promise<DeletedProjectRecord[]> {
    return this.projects.findDeletedByOwner(ownerId);
  }
}
