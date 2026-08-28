import { Inject, Injectable } from '@nestjs/common';

import { ProjectNotFoundError } from './errors';
import { type ProjectRecord, ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(@Inject(ProjectsRepository) private readonly projects: ProjectsRepository) {}

  create(ownerId: string, name: string): Promise<ProjectRecord> {
    return this.projects.create({ name, ownerId });
  }

  listForOwner(ownerId: string): Promise<ProjectRecord[]> {
    return this.projects.findAllByOwner(ownerId);
  }

  /**
   * Единственная точка, через которую другие модули узнают, что проект существует
   * и доступен вызывающему. Возвращает запись, а не булево: `PagesService` нужен
   * подтверждённый `projectId`, и промежуточная проверка «а теперь прочитаем ещё
   * раз» только открывала бы окно между проверкой и использованием.
   */
  async requireOwned(id: string, ownerId: string): Promise<ProjectRecord> {
    const project = await this.projects.findByIdForOwner(id, ownerId);

    if (project === null) {
      throw new ProjectNotFoundError();
    }

    return project;
  }
}
